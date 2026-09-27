import { AxiError, EXIT, emitError, parseArgs, setJsonMode } from './axi.js';
import * as cmd from './commands.js';

const COMMANDS = {
  analyze: cmd.analyze,
  create: cmd.create,
  update: cmd.update,
  validate: cmd.validate,
  inspect: cmd.inspect,
  status: cmd.inspect,
  show: cmd.show,
  open: cmd.open,
  stop: cmd.stop,
  feedback: cmd.feedback,
  poll: cmd.poll,
  resolve: cmd.resolve,
  setup: cmd.setup,
  eval: cmd.evalGolden,
};

const BOOLEANS = ['json', 'no-browser', 'all', 'dismiss', 'project', 'force', 'help'];

export async function main(argv) {
  const [name, ...rest] = argv;
  const args = parseArgs(rest, BOOLEANS);
  setJsonMode(args.flags.json);

  if (!name || name === 'help' || name === '--help' || name === '-h' || args.flags.help) {
    process.stdout.write(`${cmd.HELP}\n`);
    return;
  }
  const run = COMMANDS[name];
  try {
    if (!run) {
      const close = Object.keys(COMMANDS).find((c) => c.startsWith(name.slice(0, 3)));
      throw new AxiError('UNKNOWN_COMMAND', `"${name}" is not a Sherlock command.`, {
        next: [...(close ? [`sherlock ${close}`] : []), 'sherlock help'],
      });
    }
    await run(args);
  } catch (e) {
    if (e instanceof AxiError) {
      emitError(e);
      process.exitCode = e.exit;
    } else {
      emitError(new AxiError('INTERNAL', e?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(e), { exit: EXIT.USAGE }));
      process.exitCode = EXIT.USAGE;
    }
  }
}
