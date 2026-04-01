/* eslint-disable no-console */

const COMMANDS = {
  setup: () => require('./setup'),
  doctor: () => require('./doctor'),
  source: () => require('./source'),
  skill: () => require('./skill'),
};

function showHelp() {
  console.log('claudecode-omc — Multi-source Claude Code skill manager');
  console.log('');
  console.log('Usage: omc-manage <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  setup   [--scope user|project] [--force] [--dry-run]  Install merged skills');
  console.log('  doctor                                                 Health checks');
  console.log('  source  list|sync|status|set                           Manage sources');
  console.log('  skill   list|prefer|conflicts                          Manage skills');
  console.log('  help                                                   Show this help');
}

async function main(argv) {
  const command = argv[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    return;
  }

  const loader = COMMANDS[command];
  if (!loader) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "omc-manage help" for usage.');
    process.exit(1);
  }

  const mod = loader();
  const handler = mod[command];
  const args = argv.slice(1);

  // Parse common flags
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg === '--force') flags.force = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg.startsWith('--scope=')) flags.scope = arg.split('=')[1];
    else if (arg === '--scope') flags._nextIsScope = true;
    else if (flags._nextIsScope) { flags.scope = arg; delete flags._nextIsScope; }
    else if (arg === '--fork') flags.fork = true;
    else if (arg === '--upstream') flags.upstream = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg.startsWith('--local=')) flags.local = arg.split('=')[1];
    else if (arg === '--local') flags._nextIsLocal = true;
    else if (flags._nextIsLocal) { flags.local = arg; delete flags._nextIsLocal; }
    else positional.push(arg);
  }

  await handler(positional, flags);
}

module.exports = { main };
