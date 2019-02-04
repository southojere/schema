import { typescriptOfSchema } from "schemats";
import { format } from "prettier";
import path from "path";
import fs from "fs-extra";
import _ from "lodash";
import Knex from "knex";

const knex = Knex({
  ...require("../config.development.json").database,
});

const GENERATED_DIR = path.join(__dirname, "..", "src", "generated");
const OUT_TYPES = path.join(GENERATED_DIR, "ghost-db-types.ts");
const OUT_TABLES = path.join(GENERATED_DIR, "ghost-db-tables.ts");

async function generateTypes() {
  const rows = await knex
    .select("*")
    .from("information_schema.tables")
    .where("table_schema", "ghost_nexus");
  const tableNames = _.map(rows, "TABLE_NAME").sort();
  const connectionString = dbConnectionString();
  await knex.destroy();
  console.log(`Reading from: ${connectionString}`);
  const contents = await typescriptOfSchema(
    connectionString,
    tableNames,
    null,
    {
      writeHeader: false,
      camelCase: true,
    }
  );
  await fs.writeFile(OUT_TYPES, format(contents, { parser: "typescript" }));
  const tableRows = tableNames.reduce((result: string[], tbl) => {
    return result.concat(
      `${_.camelCase(tbl)}: dbt.${_.upperFirst(_.camelCase(tbl))};`
    );
  }, []);
  await fs.writeFile(
    OUT_TABLES,
    format(
      `
      /* Auto generated by ${__filename.replace(__dirname, "")} */
      import * as dbt from './ghost-db-types';

      export interface DBTables {
        ${tableRows.join("\n")}
      }

      export type DBTableName = Extract<keyof DBTables, string>;
    `,
      {
        parser: "typescript",
      }
    )
  );
}

function dbConnectionString() {
  const {
    database: {
      client,
      connection: { host, port, user, password, database },
    },
  } = require("../config.development.json");
  return `${client}://${user}:${password}@${host}:${port}/${database}`;
}

generateTypes()
  .then(() => {
    console.log("Types generated.");
    process.exit();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
