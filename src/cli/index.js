/* eslint-disable no-console */

const COMMANDS = {
  setup: () => require('./setup'),
  doctor: () => require('./doctor'),
  source: () => require('./source'),
  skill: () => require('./skill'),
  artifact: () => require('./artifact'),
};

function showHelp() {
  console.log('claudecode-omc — Claude Code harness manager');
  console.log('');
  console.log('Usage: omc-manage <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  setup     [--scope user|project] [--force] [--dry-run] [--type <type>]');
  console.log('            Install merged artifacts (skills, agents, hooks, commands, etc.)');
  console.log('  doctor    Health checks for all artifact types');
  console.log('  source    list|add|remove|sync|status — manage sources');
  console.log('  artifact  list|prefer|conflicts [--type <type>] — manage artifacts');
  console.log('  skill     list|prefer|conflicts — alias for artifact --type skills');
  console.log('            evaluate [name] — quality score (Anthropic-aligned)');
  console.log('            compare [--threshold N] — cross-source overlap analysis');
  console.log('            recommend [--apply] — preference recommendations');
  console.log('  help      Show this help');
  console.log('');
  console.log('Artifact types: skills, agents, hooks, commands, claude-md, settings, hud');
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

  // Parse flags
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--force') flags.force = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--verbose') flags.verbose = true;
    else if (arg === '--all') flags.all = true;
    else if (arg === '--upstream') flags.upstream = true;
    else if (arg === '--local') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        flags.local = args[++i];
      } else {
        flags.local = true;
      }
    }
    else if (arg === '--scope' && args[i + 1]) flags.scope = args[++i];
    else if (arg.startsWith('--scope=')) flags.scope = arg.split('=')[1];
    else if (arg === '--type' && args[i + 1]) flags.type = args[++i];
    else if (arg.startsWith('--type=')) flags.type = arg.split('=')[1];
    else if (arg === '--ref' && args[i + 1]) flags.ref = args[++i];
    else if (arg === '--priority' && args[i + 1]) flags.priority = parseInt(args[++i], 10);
    else if (arg === '--artifacts' && args[i + 1]) flags.artifacts = args[++i].split(',');
    else if (arg === '--apply') flags.apply = true;
    else if (arg === '--threshold' && args[i + 1]) flags.threshold = args[++i];
    else if (arg.startsWith('--threshold=')) flags.threshold = arg.split('=')[1];
    else positional.push(arg);
  }

  await handler(positional, flags);
}

module.exports = { main };
