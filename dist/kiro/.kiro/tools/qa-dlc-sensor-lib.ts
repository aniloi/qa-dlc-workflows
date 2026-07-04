// qa-dlc-sensor-lib.ts — tiny shared helpers for the per-sensor scripts: the
// --stage/--file-path arg contract and the locked stdout JSON shape. Keeps each
// sensor script to its check logic.

export interface Finding {
  line: number;
  rule: string;
  message: string;
  file?: string;
}

export interface SensorOutput {
  pass: boolean;
  findings: Finding[];
  findings_count: number;
}

export interface SensorArgs {
  stage: string;
  filePath: string;
}

export function parseArgs(argv: string[], name: string): SensorArgs {
  let stage = "";
  let filePath = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--stage") stage = argv[++i] ?? "";
    else if (argv[i] === "--file-path") filePath = argv[++i] ?? "";
    else if (argv[i] === "--help" || argv[i] === "-h") {
      process.stdout.write(`Usage: ${name} --stage <slug> --file-path <path>\n`);
      process.exit(0);
    }
  }
  if (!filePath) {
    process.stderr.write(`${name}: missing required flag: --file-path\n`);
    process.exit(1);
  }
  return { stage, filePath };
}

export function printJson(out: SensorOutput): void {
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(0);
}
