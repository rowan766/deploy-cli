const { NodeSSH } = require('node-ssh');
const chalk = require('chalk');
const ora = require('ora');

class SSHConnection {
  constructor(config) {
    this.config = config;
    this.ssh = new NodeSSH();
    this.connected = false;
  }

  /**
   * 连接到服务器
   */
  async connect() {
    const spinner = ora(`连接服务器 ${this.config.host}...`).start();
    
    try {
      await this.ssh.connect({
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        password: this.config.password,
        privateKey: this.config.privateKey,
        passphrase: this.config.passphrase,
        readyTimeout: 20000
      });
      
      this.connected = true;
      spinner.succeed(`已连接到服务器 ${this.config.host}`);
      
    } catch (error) {
      spinner.fail('服务器连接失败');
      throw new Error(`SSH连接失败: ${error.message}`);
    }
  }

  /**
   * 执行远程命令
   */
  async exec(command, options = {}) {
    if (!this.connected) {
      throw new Error('SSH未连接');
    }

    try {
      console.log(chalk.gray(`执行命令: ${command}`));
      
      const result = await this.ssh.execCommand(command, {
        cwd: options.cwd || this.config.deployPath,
        stream: 'both'
      });

      if (result.code !== 0) {
        throw new Error(`命令执行失败: ${result.stderr}`);
      }

      if (result.stdout) {
        console.log(chalk.gray(result.stdout));
      }

      return result.stdout;
      
    } catch (error) {
      throw new Error(`远程命令执行失败: ${error.message}`);
    }
  }

  /**
   * 上传单个文件
   */
  async uploadFile(localPath, remotePath) {
    if (!this.connected) {
      throw new Error('SSH未连接');
    }

    try {
      await this.ssh.putFile(localPath, remotePath);
      console.log(chalk.green(`✓ 上传文件: ${localPath} -> ${remotePath}`));
    } catch (error) {
      throw new Error(`文件上传失败: ${error.message}`);
    }
  }

  /**
   * 上传多个文件
   */
  async uploadFiles(files, remoteDir) {
    if (!this.connected) {
      throw new Error('SSH未连接');
    }

    const transfers = files.map(file => ({
      local: file.local,
      remote: `${remoteDir}/${file.remote || file.local}`
    }));

    try {
      await this.ssh.putFiles(transfers);
      console.log(chalk.green(`✓ 上传 ${files.length} 个文件完成`));
    } catch (error) {
      throw new Error(`批量文件上传失败: ${error.message}`);
    }
  }

  /**
   * 上传整个目录
   */
  async uploadDirectory(localDir, remoteDir) {
    if (!this.connected) {
      throw new Error('SSH未连接');
    }

    try {
      await this.ssh.putDirectory(localDir, remoteDir, {
        recursive: true,
        concurrency: 10,
        validate: function(itemPath) {
          const baseName = require('path').basename(itemPath);
          return baseName.substr(0, 1) !== '.' && 
                 baseName !== 'node_modules' &&
                 baseName !== '.git';
        },
        tick: function(localPath, remotePath, error) {
          if (error) {
            console.log(chalk.red(`✗ ${localPath}`));
          } else {
            console.log(chalk.gray(`  ${localPath}`));
          }
        }
      });
      
      console.log(chalk.green(`✓ 目录上传完成: ${localDir} -> ${remoteDir}`));
      
    } catch (error) {
      throw new Error(`目录上传失败: ${error.message}`);
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(remotePath, localPath) {
    if (!this.connected) {
      throw new Error('SSH未连接');
    }

    try {
      await this.ssh.getFile(localPath, remotePath);
      console.log(chalk.green(`✓ 下载文件: ${remotePath} -> ${localPath}`));
    } catch (error) {
      throw new Error(`文件下载失败: ${error.message}`);
    }
  }

  /**
   * 检查远程文件是否存在
   */
  async fileExists(remotePath) {
    try {
      const result = await this.exec(`test -f "${remotePath}" && echo "exists" || echo "not_exists"`);
      return result.trim() === 'exists';
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查远程目录是否存在
   */
  async directoryExists(remotePath) {
    try {
      const result = await this.exec(`test -d "${remotePath}" && echo "exists" || echo "not_exists"`);
      return result.trim() === 'exists';
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取远程文件列表
   */
  async listFiles(remotePath) {
    try {
      const result = await this.exec(`ls -la "${remotePath}"`);
      return result.split('\n').filter(line => line.trim());
    } catch (error) {
      throw new Error(`获取文件列表失败: ${error.message}`);
    }
  }

  /**
   * 创建远程目录
   */
  async createDirectory(remotePath) {
    try {
      await this.exec(`mkdir -p "${remotePath}"`);
      console.log(chalk.green(`✓ 创建目录: ${remotePath}`));
    } catch (error) {
      throw new Error(`创建目录失败: ${error.message}`);
    }
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo() {
    try {
      const [hostname, os, memory, disk] = await Promise.all([
        this.exec('hostname'),
        this.exec('uname -a'),
        this.exec('free -h'),
        this.exec('df -h')
      ]);

      return {
        hostname: hostname.trim(),
        os: os.trim(),
        memory: memory.trim(),
        disk: disk.trim()
      };
    } catch (error) {
      throw new Error(`获取系统信息失败: ${error.message}`);
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    if (this.connected) {
      this.ssh.dispose();
      this.connected = false;
      console.log(chalk.gray('SSH连接已断开'));
    }
  }
}

module.exports = {
  SSHConnection
};