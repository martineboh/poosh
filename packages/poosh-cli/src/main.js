import commander from "commander";
import { Poosh, OptionManager } from "poosh-core";
import Logger from "./Logger";
import * as argv from "./helpers/argv";
import { version } from "../package.json";

const NAME = "poosh";

function initCommander() {

  commander.option("-w, --plugins [string]",
    "comma separated plugins",
    argv.parseList);

  commander.option("-r, --read-only [what]",
    "read-only mode, can be remote, cache or both (default)",
    argv.parseReadOnly);

  commander.option("-n, --dry-run",
    "perform a trial run with no changes made (same as --read-only both)");

  commander.option("-f, --force [what]",
    "force mode, can be remote, cache or both (default)",
    argv.parseForce);

  commander.option("-e, --env [string]",
    "poosh environment key",
    argv.parseEnv);

  commander.option("-v, --verbose",
    "get more detailed output on every files",
    (v, total) => total + 1,
    0);

  commander.option("-q, --quiet",
    "quiet operations");

  commander.on("--help", () => {
    // eslint-disable-next-line no-console
    console.log("  Commands:\n"
      + "\n    upload [options]        (default command)"
      + "\n    sync [options]"
      + "\n\n"
      + "  Examples:\n"
      + `\n    $ ${NAME} --read-only remote --force cache`
      + `\n    $ ${NAME} sync -v`
    );
  });

  commander.version(version);
  commander.usage("<command> [options]");
  commander.parse(process.argv);
  commander.subcommand = argv.parseArgs(commander.args).subcommand;
}

export default async function main() {
  const startTime = Date.now();

  initCommander();

  let optionManager = new OptionManager()
    .addConfigFile()
    .addOptions({ plugins: commander.plugins })
    .addOptions(commander.readOnly ? { readonly: commander.readOnly } : null)
    .addOptions(commander.force ? { force: commander.force } : null);

  if (commander.dryRun) {
    // May override readOnly
    optionManager = optionManager.addOptions({
      readonly : { remote: true, cache: true }
    });
  }

  const options = optionManager.getNormalized(commander.env);
  const poosh = new Poosh(options);

  let logger;
  if (!commander.quiet) {
    logger = new Logger(startTime, options, commander.verbose);
    logger.listen(poosh);
  }

  // Execute command
  switch (commander.subcommand) {
    case "sync":
      await poosh.sync();
      break;
    case "upload":
      await poosh.upload();
      break;
    default:
      throw new Error(`Internal error: Invalid command "${commander.subcommand}"`);
  }

  if (logger) {
    logger.logFinish();
  }
}
