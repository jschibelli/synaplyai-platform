const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Port we want to close
const PORT = 3000;
const isWindows = os.platform() === 'win32';

async function closePort() {
  console.log(`Attempting to close processes on port ${PORT}...`);

  try {
    if (isWindows) {
      // Command to find the PID using the port on Windows
      exec(`netstat -ano | findstr :${PORT}`, (error, stdout) => {
        if (error) {
          console.log(`No processes found using port ${PORT}`);
        } else {
          // Parse the output to extract PIDs
          const lines = stdout.trim().split('\n');
          const pids = new Set();

          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 4) {
              const pid = parts[4];
              pids.add(pid);
            }
          });

          // Kill each PID
          pids.forEach(pid => {
            console.log(`Killing process with PID: ${pid}`);
            exec(`taskkill /F /PID ${pid}`, (err) => {
              if (err) {
                console.error(`Failed to kill process ${pid}:`, err.message);
              } else {
                console.log(`Successfully killed process ${pid}`);
              }
            });
          });
        }
        
        // Attempt to clean Next.js cache even if no processes were found
        cleanNextFolder();
      });
    } else {
      // macOS/Linux
      exec(`lsof -i :${PORT} | grep LISTEN`, (error, stdout) => {
        if (error) {
          console.log(`No processes found using port ${PORT}`);
        } else {
          const lines = stdout.trim().split('\n');
          const pids = new Set();

          lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length > 1) {
              const pid = parts[1];
              pids.add(pid);
            }
          });

          pids.forEach(pid => {
            console.log(`Killing process with PID: ${pid}`);
            exec(`kill -9 ${pid}`, (err) => {
              if (err) {
                console.error(`Failed to kill process ${pid}:`, err.message);
              } else {
                console.log(`Successfully killed process ${pid}`);
              }
            });
          });
        }
        
        cleanNextFolder();
      });
    }
  } catch (err) {
    console.error('An error occurred:', err);
  }
}

function cleanNextFolder() {
  console.log('Attempting to clean Next.js cache folder...');
  
  try {
    // On Windows, we need special handling for file locks
    if (isWindows) {
      // Force close Node.js processes that might have locks on files
      exec('taskkill /F /IM node.exe', (err) => {
        // Ignore errors - some node processes might not exist or might be system processes
        setTimeout(() => {
          tryDeleteNextFolder();
        }, 1000);
      });
    } else {
      tryDeleteNextFolder();
    }
  } catch (error) {
    console.error('Error cleaning Next.js cache:', error);
  }
}

function tryDeleteNextFolder() {
  const nextDir = path.join(__dirname, '..', '.next');
  
  // Check if .next folder exists
  if (!fs.existsSync(nextDir)) {
    console.log('.next folder does not exist, nothing to clean');
    return;
  }
  
  try {
    if (isWindows) {
      // On Windows, use native command to force delete
      exec(`rd /s /q "${nextDir}"`, (error) => {
        if (error) {
          console.error(`Could not delete .next folder: ${error.message}`);
          console.log('Please try closing all Node.js processes and delete it manually');
        } else {
          console.log('Successfully cleaned .next folder');
        }
      });
    } else {
      // Unix systems
      exec(`rm -rf "${nextDir}"`, (error) => {
        if (error) {
          console.error(`Could not delete .next folder: ${error.message}`);
        } else {
          console.log('Successfully cleaned .next folder');
        }
      });
    }
  } catch (error) {
    console.error('Error while deleting .next folder:', error);
  }
}

// Execute the cleanup
closePort();