import * as readline from 'readline';
import { saveReserveAmericaCredentials } from './keychain';
import { DEFAULT_ACCOUNT } from './config';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(query: string, hideInput = false): Promise<string> {
  return new Promise((resolve) => {
    if (hideInput) {
      // Manual implementation to hide password characters in terminal
      const stdin = process.stdin as any;
      process.stdout.write(query);
      stdin.setRawMode(true);
      stdin.resume();
      let input = '';
      
      const onData = (data: Buffer) => {
        const char = data.toString('utf8');
        switch (char) {
          case '\n':
          case '\r':
          case '\u0004': // End of transmission
            stdin.setRawMode(false);
            stdin.pause();
            process.stdout.write('\n');
            stdin.removeListener('data', onData);
            resolve(input);
            break;
          case '\u0003': // Ctrl+C
            process.exit();
            break;
          default:
            // Backspace handling
            if (char === '\u007f') {
                if (input.length > 0) {
                    input = input.slice(0, -1);
                }
            } else {
                input += char;
            }
            break;
        }
      };
      
      stdin.on('data', onData);
    } else {
      rl.question(query, (answer) => {
        resolve(answer);
      });
    }
  });
}

async function main() {
  console.log('--- Bear Lake Booker: macOS Keychain Setup ---');
  console.log('This will securely store your ReserveAmerica credentials in your macOS Keychain.');
  console.log('These credentials will be used for automated login during "Race Mode".\n');

  const username = await ask(`ReserveAmerica Email [default: ${DEFAULT_ACCOUNT}]: `);
  const email = username.trim() || DEFAULT_ACCOUNT;

  const password = await ask(`Enter password for ${email} (input will be hidden): `, true);

  if (!password) {
    console.error('Error: Password cannot be empty.');
    process.exit(1);
  }

  console.log('\nSaving to Keychain...');
  const success = saveReserveAmericaCredentials(password, email);

  if (success) {
    console.log('✅ Successfully stored credentials in macOS Keychain.');
    console.log(`Service: ReserveAmerica, Account: ${email}`);
  } else {
    console.log('❌ Failed to save credentials. Ensure you are on macOS.');
  }

  rl.close();
}

main().catch(console.error);
