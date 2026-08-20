import ts from 'typescript'

const columnFactories = new Set(['integer', 'real', 'text'])

function unwrapExpression(node) {
  let current = node

  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }

  return current
}

function callName(call) {
  const expression = unwrapExpression(call.expression)

  if (ts.isIdentifier(expression)) {
    return expression.text
  }

  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text
  }

  return null
}

function callChain(node) {
  const calls = []
  let current = unwrapExpression(node)

  while (ts.isCallExpression(current)) {
    calls.push(current)
    const expression = unwrapExpression(current.expression)

    if (!ts.isPropertyAccessExpression(expression)) {
      break
    }

    current = unwrapExpression(expression.expression)
  }

  return calls
}

function namedCall(node, name) {
  return callChain(node).find(call => callName(call) === name) || null
}

function stringLiteralValue(node) {
  const value = unwrapExpression(node)
  return ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : null
}

function propertyName(property) {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
    return property.name.text
  }

  return null
}

function objectLiteralBody(node) {
  let body = unwrapExpression(node)

  if (ts.isArrowFunction(body) || ts.isFunctionExpression(body)) {
    body = unwrapExpression(body.body)
  }

  if (ts.isBlock(body)) {
    const returnStatement = body.statements.find(statement => ts.isReturnStatement(statement))
    body = returnStatement?.expression ? unwrapExpression(returnStatement.expression) : body
  }

  return ts.isObjectLiteralExpression(body) ? body : null
}

function normalizeAction(value) {
  return String(value || 'NO ACTION').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function parseSchemaContract(source, fileName = 'server/db/schema.ts') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const tableDeclarations = []

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue
      }

      const initializer = unwrapExpression(declaration.initializer)

      if (!ts.isCallExpression(initializer) || callName(initializer) !== 'sqliteTable') {
        continue
      }

      const tableName = initializer.arguments[0] && stringLiteralValue(initializer.arguments[0])
      const columns = initializer.arguments[1] && objectLiteralBody(initializer.arguments[1])

      if (!tableName || !columns) {
        throw new Error(`Cannot parse sqliteTable declaration: ${declaration.name.text}`)
      }

      tableDeclarations.push({
        variableName: declaration.name.text,
        tableName,
        columnsNode: columns,
        indexesNode: initializer.arguments[2] || null
      })
    }
  }

  const tableNameByVariable = new Map(tableDeclarations.map(table => [table.variableName, table.tableName]))
  const columnNameByTableVariable = new Map()
  const contract = {}
  const rawForeignKeys = []

  for (const table of tableDeclarations) {
    const propertyMap = new Map()
    const columns = []

    for (const property of table.columnsNode.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue
      }

      const codeName = propertyName(property)
      const chain = callChain(property.initializer)
      const factoryCall = chain.find(call => columnFactories.has(callName(call)))
      const factory = factoryCall && callName(factoryCall)
      const columnName = factoryCall?.arguments[0] && stringLiteralValue(factoryCall.arguments[0])

      if (!codeName || !factory || !columnName) {
        throw new Error(`Cannot parse column in table ${table.tableName}`)
      }

      const primaryKey = Boolean(namedCall(property.initializer, 'primaryKey'))
      columns.push({
        name: columnName,
        type: factory.toUpperCase(),
        notNull: Boolean(namedCall(property.initializer, 'notNull')),
        primaryKey
      })
      propertyMap.set(codeName, columnName)

      const referenceCall = namedCall(property.initializer, 'references')

      if (referenceCall) {
        const target = referenceCall.arguments[0]
        const targetBody = target && (ts.isArrowFunction(target) || ts.isFunctionExpression(target))
          ? unwrapExpression(target.body)
          : null

        if (!targetBody || !ts.isPropertyAccessExpression(targetBody) || !ts.isIdentifier(targetBody.expression)) {
          throw new Error(`Cannot parse foreign key ${table.tableName}.${columnName}`)
        }

        const options = referenceCall.arguments[1] && objectLiteralBody(referenceCall.arguments[1])
        const onDeleteProperty = options?.properties.find((candidate) => {
          return ts.isPropertyAssignment(candidate) && propertyName(candidate) === 'onDelete'
        })
        const onDelete = onDeleteProperty && ts.isPropertyAssignment(onDeleteProperty)
          ? stringLiteralValue(onDeleteProperty.initializer)
          : null

        rawForeignKeys.push({
          tableVariable: table.variableName,
          from: columnName,
          targetTableVariable: targetBody.expression.text,
          targetColumnProperty: targetBody.name.text,
          onDelete: normalizeAction(onDelete)
        })
      }
    }

    columnNameByTableVariable.set(table.variableName, propertyMap)
    contract[table.tableName] = { columns, indexes: [], foreignKeys: [] }
  }

  for (const table of tableDeclarations) {
    const indexesBody = table.indexesNode && objectLiteralBody(table.indexesNode)

    if (!indexesBody) {
      continue
    }

    for (const property of indexesBody.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue
      }

      const chain = callChain(property.initializer)
      const indexCall = chain.find(call => ['index', 'uniqueIndex'].includes(callName(call)))
      const onCall = chain.find(call => callName(call) === 'on')
      const indexName = indexCall?.arguments[0] && stringLiteralValue(indexCall.arguments[0])

      if (!indexCall || !onCall || !indexName) {
        throw new Error(`Cannot parse index in table ${table.tableName}`)
      }

      const columns = onCall.arguments.map((argument) => {
        const value = unwrapExpression(argument)

        if (!ts.isPropertyAccessExpression(value)) {
          throw new Error(`Cannot parse index column for ${indexName}`)
        }

        const columnName = columnNameByTableVariable.get(table.variableName)?.get(value.name.text)

        if (!columnName) {
          throw new Error(`Unknown index column ${value.name.text} for ${indexName}`)
        }

        return columnName
      })

      contract[table.tableName].indexes.push({
        name: indexName,
        unique: callName(indexCall) === 'uniqueIndex',
        columns
      })
    }
  }

  for (const foreignKey of rawForeignKeys) {
    const sourceTable = tableNameByVariable.get(foreignKey.tableVariable)
    const targetTable = tableNameByVariable.get(foreignKey.targetTableVariable)
    const targetColumn = columnNameByTableVariable
      .get(foreignKey.targetTableVariable)
      ?.get(foreignKey.targetColumnProperty)

    if (!sourceTable || !targetTable || !targetColumn) {
      throw new Error(`Cannot resolve foreign key from ${foreignKey.tableVariable}.${foreignKey.from}`)
    }

    contract[sourceTable].foreignKeys.push({
      from: [foreignKey.from],
      table: targetTable,
      to: [targetColumn],
      onDelete: foreignKey.onDelete
    })
  }

  return contract
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

function normalizeSqliteType(value) {
  return String(value || '').trim().toUpperCase().split(/[\s(]/, 1)[0]
}

function foreignKeySignature(foreignKey) {
  return JSON.stringify({
    from: foreignKey.from,
    table: foreignKey.table,
    to: foreignKey.to,
    onDelete: normalizeAction(foreignKey.onDelete)
  })
}

export async function verifyDatabaseSchemaContract(client, contract, tableSet) {
  const violations = []

  for (const [tableName, expected] of Object.entries(contract)) {
    if (!tableSet.has(tableName)) {
      continue
    }

    const tableInfo = await client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    const actualColumns = new Map(tableInfo.rows.map(row => [String(row.name), {
      type: normalizeSqliteType(row.type),
      notNull: Number(row.notnull) === 1,
      primaryKey: Number(row.pk) > 0
    }]))
    const expectedColumnNames = new Set(expected.columns.map(column => column.name))

    for (const column of expected.columns) {
      const actual = actualColumns.get(column.name)

      if (!actual) {
        violations.push({ kind: 'missing_column', table: tableName, column: column.name })
        continue
      }

      if (actual.type !== column.type) {
        violations.push({
          kind: 'column_type',
          table: tableName,
          column: column.name,
          expected: column.type,
          actual: actual.type
        })
      }

      if (!column.primaryKey && actual.notNull !== column.notNull) {
        violations.push({
          kind: 'column_nullability',
          table: tableName,
          column: column.name,
          expected: column.notNull,
          actual: actual.notNull
        })
      }

      if (actual.primaryKey !== column.primaryKey) {
        violations.push({
          kind: 'column_primary_key',
          table: tableName,
          column: column.name,
          expected: column.primaryKey,
          actual: actual.primaryKey
        })
      }
    }

    for (const columnName of actualColumns.keys()) {
      if (!expectedColumnNames.has(columnName)) {
        violations.push({ kind: 'unexpected_column', table: tableName, column: columnName })
      }
    }

    const indexList = await client.execute(`PRAGMA index_list(${quoteIdentifier(tableName)})`)
    const actualIndexes = new Map()

    for (const row of indexList.rows) {
      if (String(row.origin) !== 'c') {
        continue
      }

      const name = String(row.name)
      const indexInfo = await client.execute(`PRAGMA index_info(${quoteIdentifier(name)})`)
      actualIndexes.set(name, {
        unique: Number(row.unique) === 1,
        columns: [...indexInfo.rows]
          .sort((left, right) => Number(left.seqno) - Number(right.seqno))
          .map(indexRow => String(indexRow.name))
      })
    }

    const expectedIndexNames = new Set(expected.indexes.map(index => index.name))

    for (const index of expected.indexes) {
      const actual = actualIndexes.get(index.name)

      if (!actual) {
        violations.push({ kind: 'missing_index', table: tableName, index: index.name })
        continue
      }

      if (actual.unique !== index.unique) {
        violations.push({
          kind: 'index_uniqueness',
          table: tableName,
          index: index.name,
          expected: index.unique,
          actual: actual.unique
        })
      }

      if (JSON.stringify(actual.columns) !== JSON.stringify(index.columns)) {
        violations.push({
          kind: 'index_columns',
          table: tableName,
          index: index.name,
          expected: index.columns,
          actual: actual.columns
        })
      }
    }

    for (const indexName of actualIndexes.keys()) {
      if (!expectedIndexNames.has(indexName)) {
        violations.push({ kind: 'unexpected_index', table: tableName, index: indexName })
      }
    }

    const foreignKeyRows = await client.execute(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`)
    const actualForeignKeyGroups = new Map()

    for (const row of foreignKeyRows.rows) {
      const id = Number(row.id)
      const group = actualForeignKeyGroups.get(id) || {
        table: String(row.table),
        onDelete: normalizeAction(row.on_delete),
        columns: []
      }
      group.columns.push({ seq: Number(row.seq), from: String(row.from), to: String(row.to) })
      actualForeignKeyGroups.set(id, group)
    }

    const actualForeignKeys = [...actualForeignKeyGroups.values()].map((foreignKey) => {
      const columns = foreignKey.columns.sort((left, right) => left.seq - right.seq)
      return {
        from: columns.map(column => column.from),
        table: foreignKey.table,
        to: columns.map(column => column.to),
        onDelete: foreignKey.onDelete
      }
    })
    const expectedForeignKeys = new Map(expected.foreignKeys.map(foreignKey => [
      foreignKeySignature(foreignKey),
      foreignKey
    ]))
    const actualForeignKeysBySignature = new Map(actualForeignKeys.map(foreignKey => [
      foreignKeySignature(foreignKey),
      foreignKey
    ]))

    for (const [signature, foreignKey] of expectedForeignKeys) {
      if (!actualForeignKeysBySignature.has(signature)) {
        violations.push({ kind: 'missing_foreign_key', table: tableName, foreignKey })
      }
    }

    for (const [signature, foreignKey] of actualForeignKeysBySignature) {
      if (!expectedForeignKeys.has(signature)) {
        violations.push({ kind: 'unexpected_foreign_key', table: tableName, foreignKey })
      }
    }
  }

  return violations
}
