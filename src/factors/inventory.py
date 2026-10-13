"""Resolve reviewed declarations with AST only; never import a model."""
import ast
import hashlib
import json
from pathlib import Path

DECLARATIONS = ('finsight/plugins/engines.py', 'src/regimes/plugins.py',
                'src/regimes/local.py', 'examples/momentum_plugin.py')

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()

def declarations(root):
    classes, constants, registrations = {}, {'RET': 'proportional_return', 'VOL': 'per_observation_volatility'}, []
    def literal(node):
        if isinstance(node, ast.Name) and node.id in constants:
            return constants[node.id]
        try:
            return ast.literal_eval(node)
        except (ValueError, TypeError) as error:
            raise ValueError('Unresolved dynamic declaration; no import fallback') from error
    for path in DECLARATIONS:
        tree = ast.parse((Path(root) / path).read_bytes())
        for node in tree.body:
            if isinstance(node, ast.ClassDef):
                attrs = {}
                for item in node.body:
                    if isinstance(item, ast.Assign) and len(item.targets) == 1 and isinstance(item.targets[0], ast.Name):
                        attrs[item.targets[0].id] = item.value
                bases = [b.id for b in node.bases if isinstance(b, ast.Name)]
                if len(bases) != 1:
                    raise ValueError('Unresolved plugin inheritance')
                classes[node.name] = (path, attrs, bases[0])
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('ENGINES', 'SERIES_PLUGINS', 'LOCAL_PLUGINS') for t in node.targets):
                value = node.value
                if isinstance(value, ast.Dict):
                    if any(not isinstance(v, ast.Name) for v in value.values):
                        raise ValueError('Dynamic registration forbidden')
                    registrations.extend((literal(k), v.id, 'ROW_ADAPTER') for k, v in zip(value.keys, value.values))
                elif isinstance(value, ast.DictComp) and len(value.generators) == 1:
                    gen = value.generators[0]
                    if not isinstance(gen.target, ast.Name) or not isinstance(gen.iter, (ast.Tuple, ast.List)) or gen.ifs or gen.is_async:
                        raise ValueError('Dynamic registration forbidden')
                    if not (isinstance(value.key, ast.Attribute) and isinstance(value.key.value, ast.Name) and value.key.value.id == gen.target.id and value.key.attr == 'name' and isinstance(value.value, ast.Name) and value.value.id == gen.target.id):
                        raise ValueError('Unresolved registration mapping')
                    registrations.extend((None, v.id, 'SERIES_MODEL') for v in gen.iter.elts if isinstance(v, ast.Name))
                    if any(not isinstance(v, ast.Name) for v in gen.iter.elts):
                        raise ValueError('Dynamic plugin import forbidden')
                else:
                    raise ValueError('Unresolved registration; fail closed')
    registrations.append(('examples.momentum_plugin.MomentumModel', 'MomentumModel', 'RETAINED_FIXTURE'))
    def attr(name, key, default=None, seen=()):
        if name in seen:
            raise ValueError('Cyclic declaration inheritance')
        if name not in classes:
            if name not in ('Model', 'SeriesModel'):
                raise ValueError('Unknown declaration base')
            return default
        _, attrs, base = classes[name]
        return attrs[key] if key in attrs else attr(base, key, default, (*seen, name))
    def signals(node):
        if node is None:
            return []
        if not isinstance(node, (ast.Tuple, ast.List)):
            raise ValueError('Dynamic output declaration forbidden')
        result = []
        for call in node.elts:
            if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name) or call.func.id != 'SignalType' or call.keywords or not 1 <= len(call.args) <= 3:
                raise ValueError('Unknown SignalType declaration')
            args = [literal(x) for x in call.args]
            result.append({'output': args[0], 'declared_type': args[1] if len(args)>1 else 'float', 'declared_unit': args[2] if len(args)>2 else 'dimensionless'})
        return result
    definitions, items = [], []
    for registered, name, kind in registrations:
        if name not in classes:
            raise ValueError('Registered class unavailable')
        path, _, _ = classes[name]
        plugin = registered or literal(attr(name, 'name'))
        version_node = attr(name, 'version')
        version = literal(version_node) if version_node else '1'
        class_path = path[:-3].replace('/', '.') + '.' + name
        groups = {'current': [], 'derived': []}
        if kind == 'SERIES_MODEL':
            groups['current'] = signals(attr(name, 'outputs'))
            groups['derived'] = signals(attr(name, 'derived_outputs'))
        else:
            names = literal(attr(name, 'outputs'))
            node = attr(name, 'output_types')
            types = {}
            if node is not None:
                if not isinstance(node, ast.Dict):
                    raise ValueError('Dynamic output types forbidden')
                for k, v in zip(node.keys, node.values):
                    synthetic = ast.Tuple(elts=[v], ctx=ast.Load())
                    types[literal(k)] = signals(synthetic)[0]
            groups['current'] = [types.get(n, {'output': n, 'declared_type': 'float', 'declared_unit': 'dimensionless'}) for n in names]
        definition = {'plugin_id': plugin, 'class_path': class_path, 'version': version, 'registration_kind': kind,
                      'declaration_sha256': hashlib.sha256(canonical(groups)).hexdigest()}
        definitions.append(definition)
        for channel, rows in groups.items():
            items.extend({'plugin_id': plugin, 'class_path': class_path, 'plugin_version': version,
                          'output_channel': channel, **row} for row in rows)
    if len({d['plugin_id'] for d in definitions}) != len(definitions):
        raise ValueError('Duplicate registration')
    return {'definitions': definitions, 'items': items,
            'exclusions': [{'class_path': 'src.regimes.plugins._HMM', 'reason_code': 'ABSTRACT_BASE'},
                           {'class_path': 'tests:MeanModel/MeanSeries/Consumer', 'reason_code': 'TEST_HELPERS'}]}

def verify_inventory(root):
    root = Path(root)
    retained = json.loads((root / 'eval/factors/v0.1/output-inventory.json').read_bytes())
    # New production registration sites cannot hide outside the reviewed matrix.
    for package in ('src','finsight','examples'):
        for path in (root/package).rglob('*.py'):
            relative=path.relative_to(root).as_posix()
            if relative in DECLARATIONS or relative.startswith('src/factors/'):
                continue
            tree=ast.parse(path.read_bytes())
            for node in ast.walk(tree):
                if isinstance(node,(ast.Assign,ast.AnnAssign)):
                    targets=node.targets if isinstance(node,ast.Assign) else [node.target]
                    if any(isinstance(t,ast.Name) and t.id in ('ENGINES','SERIES_PLUGINS','LOCAL_PLUGINS') for t in targets):
                        raise ValueError('Unreviewed registration site: '+relative)
                if isinstance(node,ast.ClassDef) and relative not in ('finsight/plugins/series.py','finsight/plugins/model.py'):
                    if any(isinstance(b,ast.Name) and b.id in ('Model','SeriesModel') for b in node.bases):
                        raise ValueError('Unreviewed model declaration: '+relative)
    actual = declarations(root)
    # Expected declarations and reviewed eligibility rows are independent seals.
    if actual != retained['declarations']:
        raise ValueError('Inventory omitted, changed or invented a declaration')
    keys = lambda rows: {(x['plugin_id'], x['output_channel'], x['output']) for x in rows}
    if keys(actual['items']) != keys(retained['audit']) or len(retained['audit']) != len(actual['items']):
        raise ValueError('Every channel requires exactly one audited record')
    for row, reviewed in zip(actual['items'], retained['audit']):
        if any(reviewed[k] != v for k, v in row.items()):
            raise ValueError('Audit declaration/type substitution')
    return retained
