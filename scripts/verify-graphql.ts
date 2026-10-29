/**
 * Validates every GraphQL operation in the repo against cdk/schema/schema.graphql,
 * and checks AppSync auth: client operations (src/) may only touch fields that
 * allow @aws_lambda; server operations (cdk/lambda/) only fields that allow
 * @aws_iam. A mismatch here is a request AppSync would reject after deploy.
 *
 * Run with: npx tsx scripts/verify-graphql.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSchema,
  getNamedType,
  isObjectType,
  parse,
  validate,
  visit,
  TypeInfo,
  visitWithTypeInfo,
  type GraphQLField,
  type GraphQLObjectType,
} from 'graphql';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// AppSync built-ins the plain graphql-js validator doesn't know about.
const APPSYNC_PRELUDE = `
  scalar AWSTimestamp
  scalar AWSDateTime
  scalar AWSJSON
  directive @aws_iam on OBJECT | FIELD_DEFINITION
  directive @aws_lambda on OBJECT | FIELD_DEFINITION
  directive @aws_api_key on OBJECT | FIELD_DEFINITION
  directive @aws_subscribe(mutations: [String]) on FIELD_DEFINITION
`;

const schemaSdl = readFileSync(join(ROOT, 'cdk/schema/schema.graphql'), 'utf-8');
const schema = buildSchema(APPSYNC_PRELUDE + schemaSdl);

type Mode = 'aws_lambda' | 'aws_iam';
const DEFAULT_MODE: Mode = 'aws_iam'; // the API's default authorization type

function directivesOf(node: { astNode?: { directives?: readonly { name: { value: string } }[] } | null }) {
  return (node.astNode?.directives ?? []).map((d) => d.name.value);
}

/** AppSync rule: a field's own auth directives win; else its type's; else the default mode. */
function fieldAllows(parent: GraphQLObjectType, field: GraphQLField<unknown, unknown>, mode: Mode): boolean {
  const authOf = (names: string[]) => names.filter((n) => n.startsWith('aws_') && n !== 'aws_subscribe');
  const own = authOf(directivesOf(field));
  if (own.length) return own.includes(mode);
  const typeLevel = authOf(directivesOf(parent));
  if (typeLevel.length) return typeLevel.includes(mode);
  return mode === DEFAULT_MODE;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const sources: Array<{ file: string; mode: Mode }> = [
  ...walk(join(ROOT, 'src')).map((file) => ({ file, mode: 'aws_lambda' as const })),
  ...walk(join(ROOT, 'cdk/lambda')).map((file) => ({ file, mode: 'aws_iam' as const })),
];

let checked = 0;
const errors: string[] = [];
for (const { file, mode } of sources) {
  const text = readFileSync(file, 'utf-8');
  for (const m of text.matchAll(/\/\* GraphQL \*\/ `([\s\S]*?)`/g)) {
    const doc = parse(m[1]!);
    const name = doc.definitions.map((d) => ('name' in d && d.name ? d.name.value : '?')).join(',');
    const where = `${relative(ROOT, file)} ${name}`;
    checked += 1;
    for (const e of validate(schema, doc)) errors.push(`${where}: ${e.message}`);

    const typeInfo = new TypeInfo(schema);
    visit(
      doc,
      visitWithTypeInfo(typeInfo, {
        Field() {
          const parent = typeInfo.getParentType();
          const field = typeInfo.getFieldDef();
          if (!parent || !field || !isObjectType(getNamedType(parent))) return;
          const obj = getNamedType(parent) as GraphQLObjectType;
          if (!fieldAllows(obj, field, mode)) {
            errors.push(`${where}: ${obj.name}.${field.name} does not allow @${mode}`);
          }
        },
      }),
    );
  }
}

if (errors.length) {
  console.error(`[verify-graphql] ${errors.length} problem(s) in ${checked} operations`);
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}
console.log(`[verify-graphql] ${checked} operations valid against the schema and its auth modes`);
