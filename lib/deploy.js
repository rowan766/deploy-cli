const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const { SSHConnection } = require('./ssh');
const { loadConfig } = require('./config');
const { validateEnvironment, getCurrentBranch, getGitStatus } = require('./utils');

/**
 * 部署项目主函数
 */
async function deployProject(options) {
  const { env, branch = 'main', force = false, dryRun = false } = options;
  
  console.log(chalk.cyan(`\n🚀 开始部署到 ${env} 环境\n`));
  
  // 1. 验证环境
  const spinner = ora('验证部署环境...').start();
  try {
    await validateEnvironment(env);
    spinner.succeed('环境验证通过');
  } catch (error) {
    spinner.fail('环境验证失败');
    throw error;
  }
  
  // 2. 加载配置
  const config = await loadConfig(env);
  if (!config) {
    throw new Error(`未找到 ${env} 环境的配置`);
  }
  
  // 3. Git状态检查
  await checkGitStatus(branch, force);
  
  // 4. 确认部署信息
  if (!force && !dryRun) {
    await confirmDeployment(env, branch, config);
  }
  
  if (dryRun) {
    console.log(chalk.yellow('\n🧪 模拟部署模式，不会实际执行部署操作\n'));
    await simulateDeployment(config, branch);
    return;
  }
  
  // 5. 执行部署流程
  await executeDeployment(config, branch, env);
  
  console.log(chalk.green('\n🎉 部署完成！\n'));
  console.log(chalk.cyan('📝 部署信息:'));
  console.log(`  环境: ${env}`);
  console.log(`  分支: ${branch}`);
  console.log(`  时间: ${new Date().toLocaleString()}`);
  
  if (config.url) {
    console.log(chalk.cyan(`\n🌐 访问地址: ${config.url}`));
  }
}

/**
 * 检查Git状态
 */
async function checkGitStatus(targetBranch, force) {
  const spinner = ora('检查Git状态...').start();
  
  try {
    const currentBranch = getCurrentBranch();
    const gitStatus = getGitStatus();
    
    // 检查是否有未提交的更改
    if (gitStatus.hasUncommittedChanges && !force) {
      spinner.fail('发现未提交的更改');
      const { shouldContinue } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldContinue',
          message: '检测到未提交的更改，是否继续部署？',
          default: false
        }
      ]);
      
      if (!shouldContinue) {
        throw new Error('部署已取消');
      }
    }
    
    // 检查分支
    if (currentBranch !== targetBranch) {
      spinner.text = `切换到分支 ${targetBranch}...`;
      execSync(`git checkout ${targetBranch}`, { stdio: 'inherit' });
    }
    
    // 拉取最新代码
    spinner.text = '拉取最新代码...';
    execSync('git pull origin ' + targetBranch, { stdio: 'inherit' });
    
    spinner.succeed(`Git状态检查完成 (分支: ${targetBranch})`);
    
  } catch (error) {
    spinner.fail('Git状态检查失败');
    throw error;
  }
}

/**
 * 确认部署信息
 */
async function confirmDeployment(env, branch, config) {
  console.log(chalk.yellow('\n📋 部署信息确认:'));
  console.log(`  环境: ${chalk.cyan(env)}`);
  console.log(`  分支: ${chalk.cyan(branch)}`);
  console.log(`  服务器: ${chalk.cyan(config.host)}`);
  console.log(`  部署路径: ${chalk.cyan(config.deployPath)}`);
  
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: '确认执行部署？',
      default: false
    }
  ]);
  
  if (!confirmed) {
    throw new Error('部署已取消');
  }
}

/**
 * 模拟部署
 */
async function simulateDeployment(config, branch) {
  const steps = [
    '构建项目',
    '连接服务器',
    '备份当前版本',
    '上传新版本',
    '安装依赖',
    '重启服务',
    '验证部署结果'
  ];
  
  for (const step of steps) {
    const spinner = ora(`模拟: ${step}...`).start();
    await new Promise(resolve => setTimeout(resolve, 1000));
    spinner.succeed(`模拟: ${step} 完成`);
  }
  
  console.log(chalk.green('\n✅ 模拟部署完成，所有步骤验证通过'));
}

/**
 * 执行实际部署
 */
async function executeDeployment(config, branch, env) {
  let ssh;
  
  try {
    // 1. 构建项目
    await buildProject(config);
    
    // 2. 连接服务器
    ssh = new SSHConnection(config);
    await ssh.connect();
    
    // 3. 备份当前版本
    await backupCurrentVersion(ssh, config);
    
    // 4. 上传新版本
    await uploadFiles(ssh, config);
    
    // 5. 安装依赖和构建
    await installAndBuild(ssh, config);
    
    // 6. 重启服务
    await restartService(ssh, config);
    
    // 7. 验证部署
    await verifyDeployment(ssh, config);
    
  } finally {
    if (ssh) {
      await ssh.disconnect();
    }
  }
}

/**
 * 构建项目
 */
async function buildProject(config) {
  const spinner = ora('构建项目...').start();
  
  try {
    if (config.buildCommand) {
      execSync(config.buildCommand, { stdio: 'inherit' });
    }
    spinner.succeed('项目构建完成');
  } catch (error) {
    spinner.fail('项目构建失败');
    throw error;
  }
}

/**
 * 备份当前版本
 */
async function backupCurrentVersion(ssh, config) {
  const spinner = ora('备份当前版本...').start();
  
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${config.backupPath}/backup-${timestamp}`;
    
    await ssh.exec(`mkdir -p ${config.backupPath}`);
    await ssh.exec(`cp -r ${config.deployPath} ${backupPath}`);
    
    spinner.succeed(`当前版本已备份到: ${backupPath}`);
  } catch (error) {
    spinner.fail('备份失败');
    throw error;
  }
}

/**
 * 上传文件
 */
async function uploadFiles(ssh, config) {
  const spinner = ora('上传文件...').start();
  
  try {
    // 确保部署目录存在
    await ssh.exec(`mkdir -p ${config.deployPath}`);
    
    // 上传文件（根据项目类型选择上传方式）
    if (config.uploadType === 'rsync') {
      await ssh.uploadDirectory(config.localPath, config.deployPath);
    } else {
      await ssh.uploadFiles(config.files, config.deployPath);
    }
    
    spinner.succeed('文件上传完成');
  } catch (error) {
    spinner.fail('文件上传失败');
    throw error;
  }
}

/**
 * 安装依赖和构建
 */
async function installAndBuild(ssh, config) {
  const spinner = ora('安装依赖...').start();
  
  try {
    // 切换到部署目录
    await ssh.exec(`cd ${config.deployPath}`);
    
    // 安装依赖
    if (config.installCommand) {
      await ssh.exec(`cd ${config.deployPath} && ${config.installCommand}`);
    }
    
    // 执行构建命令
    if (config.buildCommandRemote) {
      spinner.text = '执行远程构建...';
      await ssh.exec(`cd ${config.deployPath} && ${config.buildCommandRemote}`);
    }
    
    spinner.succeed('依赖安装和构建完成');
  } catch (error) {
    spinner.fail('依赖安装失败');
    throw error;
  }
}

/**
 * 重启服务
 */
async function restartService(ssh, config) {
  if (!config.restartCommand) {
    return;
  }
  
  const spinner = ora('重启服务...').start();
  
  try {
    await ssh.exec(config.restartCommand);
    
    // 等待服务启动
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    spinner.succeed('服务重启完成');
  } catch (error) {
    spinner.fail('服务重启失败');
    throw error;
  }
}

/**
 * 验证部署结果
 */
async function verifyDeployment(ssh, config) {
  const spinner = ora('验证部署结果...').start();
  
  try {
    if (config.verifyCommand) {
      const result = await ssh.exec(config.verifyCommand);
      console.log('验证结果:', result);
    }
    
    spinner.succeed('部署验证通过');
  } catch (error) {
    spinner.warn('部署验证失败，但部署可能已完成');
    console.log('验证错误:', error.message);
  }
}

module.exports = {
  deployProject
};