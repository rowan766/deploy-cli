const fs = require('fs-extra');
const path = require('path');
const yaml = require('js-yaml');
const chalk = require('chalk');
const inquirer = require('inquirer');
const os = require('os');

class ConfigManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.deploy-cli');
    this.configFile = path.join(this.configDir, 'config.yml');
    this.serversFile = path.join(this.configDir, 'servers.yml');
  }

  /**
   * 初始化配置文件
   */
  async initConfig() {
    console.log(chalk.cyan('🔧 初始化部署配置...\n'));

    // 确保配置目录存在
    await fs.ensureDir(this.configDir);

    // 创建默认配置
    const defaultConfig = {
      version: '1.0.0',
      global: {
        timeout: 30000,
        retries: 3,
        backupKeep: 5
      },
      environments: {
        development: {
          name: 'Development',
          description: '开发环境'
        },
        staging: {
          name: 'Staging', 
          description: '测试环境'
        },
        production: {
          name: 'Production',
          description: '生产环境'
        }
      }
    };

    const defaultServers = {
      servers: {}
    };

    // 写入配置文件
    await fs.writeFile(this.configFile, yaml.dump(defaultConfig, { indent: 2 }));
    await fs.writeFile(this.serversFile, yaml.dump(defaultServers, { indent: 2 }));

    console.log(chalk.green('✓ 配置文件初始化完成'));
    console.log(chalk.gray(`配置目录: ${this.configDir}`));
    
    // 询问是否添加第一个服务器
    const { addFirstServer } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addFirstServer',
        message: '是否现在添加第一个服务器配置？',
        default: true
      }
    ]);

    if (addFirstServer) {
      await this.addServer();
    }
  }

  /**
   * 添加服务器配置
   */
  async addServer(serverName) {
    if (!serverName) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'serverName',
          message: '服务器名称 (如: staging-server):',
          validate: (input) => input.length > 0 || '服务器名称不能为空'
        }
      ]);
      serverName = answers.serverName;
    }

    console.log(chalk.cyan(`\n📝 配置服务器: ${serverName}\n`));

    const serverConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: '服务器地址:',
        validate: (input) => input.length > 0 || '服务器地址不能为空'
      },
      {
        type: 'input',
        name: 'port',
        message: 'SSH端口:',
        default: '22'
      },
      {
        type: 'input',
        name: 'username',
        message: '用户名:',
        validate: (input) => input.length > 0 || '用户名不能为空'
      },
      {
        type: 'list',
        name: 'authType',
        message: '认证方式:',
        choices: ['密码', '私钥文件'],
        default: '私钥文件'
      },
      {
        type: 'password',
        name: 'password',
        message: '密码:',
        when: (answers) => answers.authType === '密码'
      },
      {
        type: 'input',
        name: 'privateKeyPath',
        message: '私钥文件路径:',
        default: path.join(os.homedir(), '.ssh/id_rsa'),
        when: (answers) => answers.authType === '私钥文件'
      },
      {
        type: 'input',
        name: 'deployPath',
        message: '部署路径:',
        default: '/var/www/html',
        validate: (input) => input.length > 0 || '部署路径不能为空'
      },
      {
        type: 'input',
        name: 'backupPath',
        message: '备份路径:',
        default: '/var/backups/deploy'
      },
      {
        type: 'list',
        name: 'projectType',
        message: '项目类型:',
        choices: ['Node.js', 'React/Vue SPA', 'Static HTML', 'PHP', 'Python', 'Other'],
        default: 'Node.js'
      }
    ]);

    // 根据项目类型设置默认命令
    const projectCommands = this.getProjectCommands(serverConfig.projectType);
    
    const commandConfig = await inquirer.prompt([
      {
        type: 'input',
        name: 'buildCommand',
        message: '本地构建命令:',
        default: projectCommands.buildCommand
      },
      {
        type: 'input',
        name: 'installCommand',
        message: '远程安装依赖命令:',
        default: projectCommands.installCommand
      },
      {
        type: 'input',
        name: 'buildCommandRemote',
        message: '远程构建命令:',
        default: projectCommands.buildCommandRemote
      },
      {
        type: 'input',
        name: 'restartCommand',
        message: '重启服务命令:',
        default: projectCommands.restartCommand
      },
      {
        type: 'input',
        name: 'verifyCommand',
        message: '验证部署命令:',
        default: projectCommands.verifyCommand
      },
      {
        type: 'input',
        name: 'url',
        message: '访问地址 (可选):'
      }
    ]);

    // 合并配置
    const finalConfig = {
      ...serverConfig,
      ...commandConfig,
      port: parseInt(serverConfig.port),
      privateKey: serverConfig.authType === '私钥文件' ? 
        await this.readPrivateKey(serverConfig.privateKeyPath) : undefined,
      createdAt: new Date().toISOString()
    };

    // 清理不需要的字段
    delete finalConfig.authType;
    delete finalConfig.privateKeyPath;

    // 保存配置
    await this.saveServerConfig(serverName, finalConfig);
    
    console.log(chalk.green(`\n✓ 服务器 ${serverName} 配置已保存`));
    
    // 测试连接
    const { testConnection } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'testConnection',
        message: '是否测试服务器连接？',
        default: true
      }
    ]);

    if (testConnection) {
      await this.testServerConnection(serverName, finalConfig);
    }
  }

  /**
   * 根据项目类型获取默认命令
   */
  getProjectCommands(projectType) {
    const commands = {
      'Node.js': {
        buildCommand: 'npm run build',
        installCommand: 'npm install --production',
        buildCommandRemote: '',
        restartCommand: 'pm2 restart app',
        verifyCommand: 'curl -f http://localhost:3000/health || exit 1'
      },
      'React/Vue SPA': {
        buildCommand: 'npm run build',
        installCommand: 'npm install',
        buildCommandRemote: 'npm run build',
        restartCommand: 'sudo systemctl reload nginx',
        verifyCommand: 'curl -f http://localhost/ || exit 1'
      },
      'Static HTML': {
        buildCommand: '',
        installCommand: '',
        buildCommandRemote: '',
        restartCommand: 'sudo systemctl reload nginx',
        verifyCommand: 'curl -f http://localhost/ || exit 1'
      },
      'PHP': {
        buildCommand: '',
        installCommand: 'composer install --no-dev',
        buildCommandRemote: '',
        restartCommand: 'sudo systemctl reload php-fpm && sudo systemctl reload nginx',
        verifyCommand: 'curl -f http://localhost/ || exit 1'
      },
      'Python': {
        buildCommand: '',
        installCommand: 'pip install -r requirements.txt',
        buildCommandRemote: '',
        restartCommand: 'sudo systemctl restart gunicorn',
        verifyCommand: 'curl -f http://localhost:8000/health || exit 1'
      }
    };

    return commands[projectType] || commands['Node.js'];
  }

  /**
   * 读取私钥文件
   */
  async readPrivateKey(keyPath) {
    try {
      if (await fs.pathExists(keyPath)) {
        return await fs.readFile(keyPath, 'utf8');
      }
      console.log(chalk.yellow(`⚠ 私钥文件不存在: ${keyPath}`));
      return undefined;
    } catch (error) {
      console.log(chalk.yellow(`⚠ 读取私钥文件失败: ${error.message}`));
      return undefined;
    }
  }

  /**
   * 保存服务器配置
   */
  async saveServerConfig(serverName, config) {
    let servers = { servers: {} };
    
    if (await fs.pathExists(this.serversFile)) {
      const content = await fs.readFile(this.serversFile, 'utf8');
      servers = yaml.load(content) || { servers: {} };
    }

    servers.servers[serverName] = config;
    await fs.writeFile(this.serversFile, yaml.dump(servers, { indent: 2 }));
  }

  /**
   * 测试服务器连接
   */
  async testServerConnection(serverName, config) {
    const { SSHConnection } = require('./ssh');
    const ora = require('ora');
    
    const spinner = ora(`测试连接到 ${config.host}...`).start();
    
    try {
      const ssh = new SSHConnection(config);
      await ssh.connect();
      
      // 获取系统信息
      const systemInfo = await ssh.getSystemInfo();
      await ssh.disconnect();
      
      spinner.succeed('连接测试成功');
      
      console.log(chalk.cyan('\n📊 服务器信息:'));
      console.log(`  主机名: ${systemInfo.hostname}`);
      console.log(`  系统: ${systemInfo.os.split(' ').slice(0, 3).join(' ')}`);
      
    } catch (error) {
      spinner.fail('连接测试失败');
      console.error(chalk.red(`连接错误: ${error.message}`));
    }
  }

  /**
   * 列出所有配置
   */
  async listConfigs() {
    console.log(chalk.cyan('📋 服务器配置列表\n'));

    if (!(await fs.pathExists(this.serversFile))) {
      console.log(chalk.yellow('未找到服务器配置文件，请先运行 deploy-cli config --init'));
      return;
    }

    const content = await fs.readFile(this.serversFile, 'utf8');
    const servers = yaml.load(content) || { servers: {} };

    if (Object.keys(servers.servers).length === 0) {
      console.log(chalk.yellow('暂无服务器配置，使用 --add-server 添加'));
      return;
    }

    Object.entries(servers.servers).forEach(([name, config]) => {
      console.log(chalk.green(`🖥️  ${name}`));
      console.log(`   地址: ${config.host}:${config.port}`);
      console.log(`   用户: ${config.username}`);
      console.log(`   部署路径: ${config.deployPath}`);
      console.log(`   项目类型: ${config.projectType || 'Unknown'}`);
      if (config.url) {
        console.log(`   访问地址: ${config.url}`);
      }
      console.log(`   创建时间: ${new Date(config.createdAt).toLocaleString()}`);
      console.log('');
    });
  }

  /**
   * 删除服务器配置
   */
  async removeServer(serverName) {
    if (!(await fs.pathExists(this.serversFile))) {
      console.log(chalk.yellow('未找到服务器配置文件'));
      return;
    }

    const content = await fs.readFile(this.serversFile, 'utf8');
    const servers = yaml.load(content) || { servers: {} };

    if (!servers.servers[serverName]) {
      console.log(chalk.yellow(`服务器 ${serverName} 不存在`));
      return;
    }

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: `确定删除服务器配置 ${serverName}？`,
        default: false
      }
    ]);

    if (confirmed) {
      delete servers.servers[serverName];
      await fs.writeFile(this.serversFile, yaml.dump(servers, { indent: 2 }));
      console.log(chalk.green(`✓ 服务器配置 ${serverName} 已删除`));
    }
  }

  /**
   * 加载配置
   */
  async loadConfig(env) {
    if (!(await fs.pathExists(this.serversFile))) {
      throw new Error('配置文件不存在，请先运行 deploy-cli config --init');
    }

    const content = await fs.readFile(this.serversFile, 'utf8');
    const servers = yaml.load(content) || { servers: {} };

    // 查找匹配环境的服务器
    const serverName = Object.keys(servers.servers).find(name => 
      name.includes(env) || servers.servers[name].environment === env
    );

    if (!serverName) {
      throw new Error(`未找到 ${env} 环境的服务器配置`);
    }

    return servers.servers[serverName];
  }
}

/**
 * 加载指定环境的配置
 */
async function loadConfig(env) {
  const configManager = new ConfigManager();
  return await configManager.loadConfig(env);
}

const configManager = new ConfigManager();

module.exports = {
  configManager,
  loadConfig
};