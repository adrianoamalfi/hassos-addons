// Disposable OpenSSH acceptance check. Never point at a user-managed host.
const { Client } = require('/app/node_modules/ssh2');
const { createHash } = require('node:crypto');
const expected = process.argv[2];
if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('Expected host-key hash required');
const connection = new Client();
const deadline = setTimeout(() => { console.error('SSH check timed out'); process.exit(1); }, 30000);
connection.on('error', error => { console.error(error.message); process.exitCode = 1; clearTimeout(deadline); connection.end(); });
connection.on('ready', () => connection.exec('printf fixture-terminal-ok', (error, stream) => {
  if (error) throw error;
  let output = '';
  stream.on('data', data => { output += data; });
  stream.on('close', () => {
    if (output !== 'fixture-terminal-ok') throw new Error('SSH command mismatch');
    connection.sftp((error, sftp) => {
      if (error) throw error;
      const data = Buffer.from('Termix SFTP acceptance\n');
      const filename = '/home/fixture/termix-release-check.txt';
      sftp.writeFile(filename, data, error => {
        if (error) throw error;
        sftp.readFile(filename, (error, received) => {
          if (error) throw error;
          if (!data.equals(received)) throw new Error('SFTP content mismatch');
          sftp.unlink(filename, error => {
            if (error) throw error;
            console.log('OpenSSH: verified host key, exec, SFTP upload/download and cleanup passed');
            clearTimeout(deadline); connection.end();
          });
        });
      });
    });
  });
}));
connection.connect({ host: 'termix-release-ssh', port: 22, username: 'fixture',
  password: 'Fixture-isolated-test-only-9274', algorithms: { serverHostKey: ['ssh-ed25519'] },
  hostVerifier: key => createHash('sha256').update(key).digest('hex') === expected });
