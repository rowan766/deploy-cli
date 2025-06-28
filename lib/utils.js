const { execSync } = require('child_process');
const chalk = require('chalk');
const ora = require('ora');
const { loadConfig } = require('./config');
const { SSHConnection } = require('./ssh');

/**
 * 验证部署环境
 */
async function validateEnvironment(env) {
  const validEnvs = ['development', 'staging', 'production'];
  
  if (!validEnvs.includes(env)) {
    throw new Error(`无效的环境: ${env}。有效环境: ${validEnvs.join(', ')}`);
  }
  
  // 检查是否在Git仓库中
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
  } catch (error) {
    throw new Error('当前目录不是Git仓库');
  }
  
  return true;
}

/**
 * 获取当前Git分支
 */
function getCurrentBranch() {
  try {
    return execSync('git branch --show-current', { encoding: 'utf8' }).trim();
  } catch (error) {
    throw new Error('获取当前分支失败');
  }
}

/**
 * 获取Git状态
 */
function getGitStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    const hasUncommittedChanges = status.trim().length > 0;
    
    const ahead = execSync('git rev-list --count @{u}..HEAD 2>/dev/null || echo "0"', { 
      encoding: 'utf8' 
    }).trim();
    
    const behind = execSync('git rev-list --count HEAD..@{u} 2>/dev/null || echo "0"', { 
      encoding: 'utf8' 
    }).trim();
    
    return {
      hasUncommittedChanges,
      ahead: parseInt(ahead),
      behind: parseInt(behind),
      status: status.split('\n').filter(line => line.trim())
    };
  } catch (error) {
    throw new Error('获取Git状态失败');
  }
}

/**
 * 获取项目信息
 */
function getProjectInfo() {
  try {
    const packageJson = require(process.cwd() + '/package.json');
    const gitRemote = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    const lastCommit = execSync('git log -1 --format="%h %s"', { encoding: 'utf8' }).trim();
    
    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      repository: gitRemote,
      lastCommit
    };
  } catch (error) {
    return {
      name: 'Unknown',
      version: 'Unknown',
      repository: 'Unknown',
      lastCommit: 'Unknown'
    };
  }
}

/**
 * 显示部署状态
 */
async function showStatus(env) {
  console.log(chalk.cyan(`\n📊 ${env} 环境状态\n`));
  
  try {
    const config = await loadConfig(env);
    const ssh = new SSHConnection(config);
    
    const spinner = ora('获取服务器状态...').start();
    
    await ssh.connect();
    
    // 获取系统信息
    const systemInfo = await ssh.getSystemInfo();
    
    // 获取部署信息
    const deployInfo = await getDeployInfo(ssh, config);
    
    // 获取服务状态
    const serviceStatus = await getServiceStatus(ssh, config);
    
    await ssh.disconnect();
    
    spinner.succeed('状态获取完成');
    
    // 显示信息
    console.log(chalk.yellow('🖥️  服务器信息:'));
    console.log(`   主机: ${config.host}:${config.port}`);
    console.log(`   系统: ${systemInfo.os.split(' ').slice(0, 3).join(' ')}`);
    console.log(`   主机名: ${systemInfo.hostname}`);
    
    console.log(chalk.yellow('\n📁 部署信息:'));
    console.log(`   部署路径: ${config.deployPath}`);
    console.log(`   最后部署: ${deployInfo.lastDeploy || '未知'}`);
    console.log(`   当前版本: ${deployInfo.currentVersion || '未知'}`);
    
    if (serviceStatus.length > 0) {
      console.log(chalk.yellow('\n🔧 服务状态:'));
      serviceStatus.forEach(service => {
        const status = service.status === 'active' ? 
          chalk.green('✓ 运行中') : 
          chalk.red('✗ 停止');
        console.log(`   ${service.name}: ${status}`);
      });
    }
    
    if (config.url) {
      console.log(chalk.yellow('\n🌐 访问地址:'));
      console.log(`   ${config.url}`);
    }
    
  } catch (error) {
    console.error(chalk.red('获取状态失败:'), error.message);
  }
}

/**
 * 获取部署信息
 */
async function getDeployInfo(ssh, config) {
  try {
    const deployInfo = {};
    
    // 检查是否存在部署标记文件
    const deployMarkFile = `${config.deployPath}/.deploy-info`;
    
    if (await ssh.fileExists(deployMarkFile)) {
      const content = await ssh.exec(`cat ${deployMarkFile}`);
      try {
        deployInfo = JSON.parse(content);
      } catch (e) {
        // 忽略解析错误
      }
    }
    
    // 获取目录最后修改时间
    try {
      const lastModified = await ssh.exec(`stat -c %y ${config.deployPath}`);
      deployInfo.lastDeploy = lastModified.trim();
    } catch (e) {
      // 忽略错误
    }
    
    // 尝试获取package.json版本
    try {
      const packagePath = `${config.deployPath}/package.json`;
      if (await ssh.fileExists(packagePath)) {
        const packageContent = await ssh.exec(`cat ${packagePath}`);
        const packageJson = JSON.parse(packageContent);
        deployInfo.currentVersion = packageJson.version;
      }
    } catch (e) {
      // 忽略错误
    }
    
    return deployInfo;
    
  } catch (error) {
    return {};
  }
}

/**
 * 获取服务状态
 */
async function getServiceStatus(ssh, config) {
  const services = [];
  
  try {
    // 检查常见服务状态
    const commonServices = ['nginx', 'apache2', 'pm2'];
    
    for (const serviceName of commonServices) {
      try {
        const result = await ssh.exec(`systemctl is-active ${serviceName} 2>/dev/null || echo "inactive"`);
        if (result.trim() !== 'inactive') {
          services.push({
            name: serviceName,
            status: result.trim()
          });
        }
      } catch (e) {
        // 忽略服务不存在的错误
      }
    }
    
    // 检查PM2进程
    try {
      const pm2Status = await ssh.exec('pm2 jlist 2>/dev/null || echo "[]"');
      const processes = JSON.parse(pm2Status);
      processes.forEach(proc => {
        services.push({
          name: `pm2-${proc.name}`,
          status: proc.pm2_env.status
        });
      });
    } catch (e) {
      // 忽略PM2不存在的错误
    }
    
  } catch (error) {
    // 忽略错误
  }
  
  return services;
}

/**
 * 显示日志
 */
async function showLogs(options) {
  const { env, lines = 50, follow = false } = options;
  
  console.log(chalk.cyan(`\n📝 ${env} 环境日志 (最近${lines}行)\n`));
  
  try {
    const config = await loadConfig(env);
    const ssh = new SSHConnection(config);
    
    await ssh.connect();
    
    // 构建日志命令
    let logCommand = '';
    
    // 尝试不同的日志路径
    const logPaths = [
      `${config.deployPath}/logs/app.log`,
      `${config.deployPath}/app.log`,
      '/var/log/nginx/access.log',
      '/var/log/nginx/error.log'
    ];
    
    for (const logPath of logPaths) {
      if (await ssh.fileExists(logPath)) {
        logCommand = follow ? 
          `tail -f -n ${lines} ${logPath}` : 
          `tail -n ${lines} ${logPath}`;
        
        console.log(chalk.gray(`📄 日志文件: ${logPath}\n`));
        break;
      }
    }
    
    if (!logCommand) {
      console.log(chalk.yellow('未找到日志文件'));
      await ssh.disconnect();
      return;
    }
    
    if (follow) {
      console.log(chalk.yellow('实时跟踪日志 (按 Ctrl+C 退出):\n'));
      
      // 实时跟踪需要特殊处理
      const stream = await ssh.ssh.requestExec(logCommand);
      
      stream.on('data', (data) => {
        process.stdout.write(data.toString());
      });
      
      stream.on('close', () => {
        ssh.disconnect();
      });
      
      // 处理Ctrl+C
      process.on('SIGINT', () => {
        stream.close();
        ssh.disconnect();
        process.exit(0);
      });
      
    } else {
      const logs = await ssh.exec(logCommand);
      console.log(logs);
      await ssh.disconnect();
    }
    
  } catch (error) {
    console.error(chalk.red('获取日志失败:'), error.message);
  }
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化时间
 */
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? 
    `${minutes}m ${remainingSeconds}s` : 
    `${remainingSeconds}s`;
}

/**
 * 检查端口是否开放
 */
async function checkPort(host, port) {
  const net = require('net');
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(3000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, host);
  });
}

/**
 * 显示部署摘要
 */
function showDeploymentSummary(env, branch, startTime, endTime) {
  const duration = Math.round((endTime - startTime) / 1000);
  const projectInfo = getProjectInfo();
  
  console.log(chalk.cyan('\n📋 部署摘要\n'));
  console.log(`项目: ${projectInfo.name} v${projectInfo.version}`);
  console.log(`环境: ${env}`);
  console.log(`分支: ${branch}`);
  console.log(`耗时: ${formatTime(duration)}`);
  console.log(`时间: ${new Date().toLocaleString()}`);
  console.log(`提交: ${projectInfo.lastCommit}`);
}

module.exports = {
  validateEnvironment,
  getCurrentBranch,
  getGitStatus,
  getProjectInfo,
  showStatus,
  showLogs,
  formatFileSize,
  formatTime,
  checkPort,
  showDeploymentSummary
};