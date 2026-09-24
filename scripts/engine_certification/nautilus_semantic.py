"""Execute Forge tapes in Nautilus; this process never imports the Forge oracle.

Prices, sizes, commands and marks are inputs. Executions and account state come
from the native matching engine, account and portfolio APIs, not a fill emulator.
"""

from __future__ import annotations

from decimal import Decimal
import importlib.metadata
import json
import platform
import sys

import nautilus_trader
from nautilus_trader.backtest.engine import BacktestEngine, BacktestEngineConfig
from nautilus_trader.backtest.models import LatencyModel, MakerTakerFeeModel
from nautilus_trader.common.config import LoggingConfig
from nautilus_trader.model.currencies import AUD, USD
from nautilus_trader.model.data import (
    BookOrder, MarkPriceUpdate, OrderBookDelta, OrderBookDeltas, TradeTick,
)
from nautilus_trader.model.enums import (
    AccountType, AggressorSide, BookAction, BookType, OmsType, OrderSide, TimeInForce,
)
from nautilus_trader.model.identifiers import ClientOrderId, InstrumentId, Symbol, TradeId, Venue
from nautilus_trader.model.instruments import CurrencyPair
from nautilus_trader.model.objects import Money, Price, Quantity
from nautilus_trader.portfolio.config import PortfolioConfig
from nautilus_trader.trading.strategy import Strategy


class TapeStrategy(Strategy):
    """Send commands on the native deterministic clock and capture actual fills."""

    def __init__(self, instrument, tape):
        super().__init__()
        self.instrument = instrument
        self.tape = tape
        self.orders_by_id = {}
        self.fills = []
        self.command_events = []

    def on_start(self):
        for spec in self.tape["orders"]:
            self.clock.set_time_alert_ns(
                "submit:" + spec["order_id"], int(spec["submitted_ns"]), self.on_command,
            )
            if spec.get("cancel_ns") is not None:
                self.clock.set_time_alert_ns(
                    "cancel:" + spec["order_id"], int(spec["cancel_ns"]), self.on_command,
                )

    def on_command(self, event):
        action, order_id = event.name.split(":", 1)
        self.command_events.append({"action": action, "order_id": order_id, "event_ns": int(event.ts_event)})
        if action == "submit":
            spec = next(item for item in self.tape["orders"] if item["order_id"] == order_id)
            order = self.order_factory.limit(
                instrument_id=self.instrument.id,
                order_side=OrderSide.BUY if spec["side"] == "BUY" else OrderSide.SELL,
                quantity=self.instrument.make_qty(spec["quantity"]),
                price=self.instrument.make_price(spec["limit_price"]),
                client_order_id=ClientOrderId(order_id), time_in_force=TimeInForce[spec["time_in_force"]],
            )
            self.orders_by_id[order_id] = order
            self.submit_order(order)
        else:
            # A cancellation after a terminal fill is deliberately submitted as
            # well: Nautilus decides whether the command is valid.
            self.cancel_order(self.orders_by_id[order_id])

    def on_order_filled(self, event):
        self.fills.append({
            "fill_id": str(event.trade_id),
            "order_id": str(event.client_order_id),
            "side": event.order_side.name,
            "quantity": float(event.last_qty),
            "price": float(event.last_px),
            "fee": float(event.commission),
            "event_ns": int(event.ts_event),
        })


def _book(instrument, event, sequence):
    timestamp = int(event["event_ns"])
    levels = [(OrderSide.BUY, level) for level in event["bids"]]
    levels += [(OrderSide.SELL, level) for level in event["asks"]]
    deltas = [OrderBookDelta.clear(instrument.id, sequence, timestamp, timestamp)]
    for index, (side, (price, size)) in enumerate(levels):
        deltas.append(OrderBookDelta(
            instrument.id, BookAction.ADD,
            BookOrder(side, instrument.make_price(price), instrument.make_qty(size), 0),
            128 if index == len(levels) - 1 else 0,
            sequence, timestamp, timestamp,
        ))
    return OrderBookDeltas(instrument.id, deltas)


def run_tape(tape):
    identity = {"tape_id": tape["tape_id"], "tape_hash": tape.get("tape_hash")}
    if tape["tape_id"] not in {f"T{i:02d}" for i in range(1, 11)}:
        return {**identity, "state": "UNSUPPORTED", "reason": "QUEUE_MODEL_NOT_IN_DECLARED_NAUTILUS_CAPABILITY_SET"}

    # Native cash-borrowing issuers are process-global, so isolate each tape.
    venue = Venue("FORGE" + tape["tape_id"])
    fee_rate = Decimal(str(tape["fee_bps"])) / Decimal(10000)
    instrument = CurrencyPair(
        instrument_id=InstrumentId(Symbol("TAPE"), venue), raw_symbol=Symbol("TAPE"),
        base_currency=AUD, quote_currency=USD, price_precision=2, size_precision=0, price_increment=Price.from_str("0.01"), size_increment=Quantity.from_int(1),
        lot_size=Quantity.from_int(1), maker_fee=fee_rate, taker_fee=fee_rate,
        ts_event=0, ts_init=0,
    )
    engine = BacktestEngine(BacktestEngineConfig(
        logging=LoggingConfig(bypass_logging=True),
        portfolio=PortfolioConfig(use_mark_prices=True), run_analysis=False,
    ))
    try:
        engine.add_venue(
            venue=venue, oms_type=OmsType.NETTING, account_type=AccountType.CASH,
            base_currency=None, starting_balances=[Money(tape["initial_cash"], USD), Money(0, AUD)],
            book_type=BookType.L2_MBP, fee_model=MakerTakerFeeModel(),
            latency_model=LatencyModel(base_latency_nanos=0, insert_latency_nanos=int(tape["latency_ns"])),
            use_message_queue=True, liquidity_consumption=True,
            allow_cash_borrowing=True, queue_position=False,
        )
        engine.add_instrument(instrument)
        books, trades = [], []
        for index, event in enumerate(tape["events"], 1):
            if event["type"] == "book":
                books.append(_book(instrument, event, index))
            elif event["type"] == "trade":
                timestamp = int(event["event_ns"])
                trades.append(TradeTick(
                    instrument.id, instrument.make_price(event["price"]),
                    instrument.make_qty(event["quantity"]),
                    AggressorSide.BUYER if event["side"] == "BUY" else AggressorSide.SELLER,
                    TradeId(f"market-{index}"), timestamp, timestamp,
                ))
            else:
                raise ValueError(f"Unknown tape event {event['type']!r}")
        engine.add_data(books)
        if trades:
            engine.add_data(trades)
        # A native mark update advances the clock through the requested horizon
        # without adding new matching liquidity or fabricating a market trade.
        engine.add_data([MarkPriceUpdate(
            instrument.id, instrument.make_price(tape["mark_price"]),
            int(tape["end_ns"]), int(tape["end_ns"]),
        )])
        strategy = TapeStrategy(instrument, tape)
        engine.add_strategy(strategy)
        engine.run()

        account = engine.cache.account_for_venue(venue)
        native_cash = account.balance_total(USD)
        native_position = engine.portfolio.net_position(instrument.id)
        native_fees = account.commissions()
        native_equity = engine.portfolio.equity(venue)
        native_realized = engine.portfolio.realized_pnl(instrument.id)
        native_unrealized = engine.portfolio.unrealized_pnl(
            instrument.id, price=instrument.make_price(tape["mark_price"]),
        )
        result_account = {
            "ending_cash": float(native_cash),
            "position": float(native_position),
            "total_fees": float(native_fees.get(USD, Money(0, USD))),
            "equity": float(native_equity[USD]),
        }
        if native_realized is not None and native_unrealized is not None:
            # Nautilus realized PnL includes commissions; Forge's gross realized
            # convention keeps fees in their separately reported account field.
            result_account["realized_pnl"] = float(native_realized) + result_account["total_fees"]
            result_account["unrealized_pnl"] = float(native_unrealized)
        else:
            result_account["pnl_status"] = "UNSUPPORTED"
        result = engine.get_result()
        return {
            **identity, "state": "SUPPORTED", "fills": strategy.fills,
            "account": result_account,
            "native_evidence": {
                "execution": "BacktestEngine/L2_MBP/liquidity_consumption", "instrument_model": "CurrencyPair", "account_model": "multi-currency CASH, allow_cash_borrowing=True", "native_base_balance": float(account.balance_total(AUD)),
                "account_source": "Account.balance_total/commissions; Portfolio.net_position/equity/realized_pnl/unrealized_pnl",
                "equity_valuation": "PortfolioConfig(use_mark_prices=True), native MarkPriceUpdate",
                "realized_pnl_convention": "native net realized PnL plus native account commissions = gross realized PnL",
                "native_net_realized_pnl": None if native_realized is None else float(native_realized),
                "native_orders": [{"order_id": key, "status": value.status.name, "time_in_force": value.time_in_force.name, "filled_quantity": float(value.filled_qty)} for key, value in strategy.orders_by_id.items()],
                "commands": strategy.command_events,
                "iterations": int(result.iterations),
                "total_orders": int(result.total_orders),
                "insert_latency_ns": int(tape["latency_ns"]),
            },
        }
    finally:
        engine.dispose()


def main():
    request = json.load(sys.stdin)
    response = {
        "engine": "nautilus", "version": nautilus_trader.__version__,
        "request_hash": request.get("request_hash"),
        "runtime": {"python": platform.python_version(), "platform": platform.platform(),
                    "distribution_version": importlib.metadata.version("nautilus_trader")},
        "results": [run_tape(tape) for tape in request["tapes"]],
    }
    print(json.dumps(response, sort_keys=True, separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
