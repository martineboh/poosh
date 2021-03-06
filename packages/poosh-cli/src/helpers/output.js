import util from "util";
import chalk from "chalk";
import humanizeDuration from "humanize-duration";
import prettyBytes from "pretty-bytes";
import ActionStatus from "poosh-common/lib/file/ActionStatus";
import getProgressPercent from "./getProgressPercent";

const STATUS_MAP = {
  [ActionStatus.Created]   : chalk.green("[created]"),
  [ActionStatus.Updated]   : chalk.blue("[updated]"),
  [ActionStatus.Deleted]   : chalk.red("[deleted]"),
  [ActionStatus.Identical] : chalk.gray("[identic]"),
  [ActionStatus.Unchanged] : chalk.gray("[unchang]")
};

function getPlural(value: Number) {
  return value === 1 ? "" : "s";
}

export function getFileLine(file: Object): string {
  return `${STATUS_MAP[file.status]} ${file.dest.absolute}`;
}

export function getMatchingLine(status: Object): string {
  const count = status.match.count.toLocaleString("en");
  const size = prettyBytes(status.match.size);
  const percent = getProgressPercent(status.match.count, status.match.total);
  return `\nMatched files: ${count} (${size}), ${percent}%.`;
}

export function getUploadingLine(status: Object): string {
  const up = status.upload;
  const count = up.count.toLocaleString("en");
  const size = prettyBytes(up.size);
  const done = up.done ? ", done." : "";
  return `\nUploaded files: ${count} (${size})${done}`;
}

export function getDeletingLine(status: Object): string {
  const del = status.delete;
  const count = del.count.toLocaleString("en");
  const size = prettyBytes(del.size);
  const done = del.done ? ", done." : "";
  return `\nDeleted remote files: ${count} (${size})${done}`;
}

export function getElapsedLine(status: Object): string {
  const elapsed = humanizeDuration(Date.now() - status.startTime, {
    round : true
  });

  return `\nElapsed time: ${elapsed}.`;
}

export function getStatLine(status: Object): string {
  const stat = status.stat;
  return `\n${
     stat.creation.toLocaleString("en")
     } creation${getPlural(stat.creation)}, ${
     stat.update.toLocaleString("en")
     } update${getPlural(stat.update)}, ${
     stat.deletion.toLocaleString("en")
     } deletion${getPlural(stat.deletion)}, ${
     stat.unchange.toLocaleString("en")
     } skip${getPlural(stat.unchange)}.`;
}

export function getWarningLine(options) {

  let fLine;
  const force = options.force;
  if (force.remote && force.cache) {
    fLine = "REMOTE & CACHE are FORCED (neither remote and local changes are checked).";
  } else if (force.remote) {
    fLine = "REMOTE is FORCED (only local changes are checked).";
  } else if (force.cache) {
    fLine = "CACHE is FORCED (only remote changes are checked).";
  }

  let roLine;
  const readonly = options.readonly;
  if (readonly.remote && readonly.cache) {
    roLine = "REMOTE & CACHE are READ-ONLY (no changes at all are committed).";
  } else if (readonly.remote) {
    roLine = "REMOTE is READ-ONLY (only cache is being updated).";
  } else if (readonly.cache) {
    roLine = "CACHE is READ-ONLY (only remote is being updated).";
  }

  return (fLine ? chalk.underline.red(`\n${fLine}`) : "")
    + (roLine ? chalk.underline.yellow(`\n${roLine}`) : "");
}

function getVerboseLines2(file: Object) {

  if (!file.cache || !file.dest) {
    return [];
  }

  const localLine = `local status : ${file.cache.status}`
    + ` [content=${file.content.status},`
    + ` headers=${file.headers.status},`
    + ` remote=${file.remote.status}]`;

  let destLine = "dest. status : ";
  const destStatus = file.dest.statusDetails;
  if (destStatus) {
    destLine += `${file.dest.status
       } [content=${destStatus.content},`
      + ` headers=${destStatus.headers},`
      + ` remote=${destStatus.remote}]`;
  } else {
    destLine += "unknown";
  }

  return [localLine, destLine];
}

function getVerboseLines3(file: Object) {

  if (!file.src || !file.content) {
    return [];
  }

  let line = `size: ${prettyBytes(file.src.size)}`;

  if (file.content.type !== "raw") {
    line += `, compressed (${file.content.type})`;
    if (file.content.size) {
      line += `: ${prettyBytes(file.content.size)}`;
    }
  }

  return [line];
}

function getVerboseLines4(file: Object) {
  return [`file object: \n${util.inspect(file, {
    depth : null,
    colors : true
  })}`];
}

export function getVerboseLines(file: Object, verbosity: number) {
  if (verbosity < 2) {
    return "";
  }

  let lines = getVerboseLines2(file);

  // eslint-disable-next-line no-magic-numbers
  if (verbosity >= 3) {
    lines = lines.concat(getVerboseLines3(file));
  }

  // eslint-disable-next-line no-magic-numbers
  if (verbosity >= 4) {
    lines = lines.concat(getVerboseLines4(file));
  }

  if (lines.length === 0) {
    return "";
  }

  const newLine = "\n  - ";
  return newLine + lines.join(newLine);
}
