#!/usr/bin/env node

const { program } = require('commander');
const chalk = require('chalk');
const figlet = require('figlet');
const packageInfo = require('../package.json');
const { deployProject } = require('../lib/deploy');
const { configManager } = require('../lib/config');
const { showStatus, showLogs } = require('../lib/utils');

// 显示欢迎信息
console.log(chalk.cyan(figlet.textSync('Deploy CLI', { horizontalLayout: 'full' })));
console.log(chalk.yellow(`v${packageInfo.version} - 自动化部署工具\n`));

// 基础配置
program
  .name('deploy-cli')
  .description('🚀 自动化部署命令行工具')
  .version(packageInfo.version);

// 部署命令
program
  .command('deploy')
  .description('部署项目到指定环境')
  .option('-e, --env <environment>', '部署环境 (development/staging/production)', 'staging')
  .option('-b, --branch <branch>', 'Git分支', 'main')
  .option('-f, --force', '强制部署（跳过确认）')
  .option('-d, --dry-run', '模拟部署（不实际执行）')
  .action(async (options) => {
    try {
      await deployProject(options);
    } catch (error) {
      console.error(chalk.red('❌ 部署失败:'), error.message);
      process.exit(1);
    }
  });

// 配置管理命令
program
  .command('config')
  .description('管理部署配置')
  .option('-a, --add-server <name>', '添加服务器配置')
  .option('-l, --list', '列出所有配置')
  .option('-r, --remove <name>', '删除服务器配置')
  .option('-i, --init', '初始化配置文件')
  .action(async (options) => {
    try {
      if (options.addServer) {
        await configManager.addServer(options.addServer);
      } else if (options.list) {
        await configManager.listConfigs();
      } else if (options.remove) {
        await configManager.removeServer(options.remove);
      } else if (options.init) {
        await configManager.initConfig();
      } else {
        console.log(chalk.yellow('请指定配置操作，使用 --help 查看帮助'));
      }
    } catch (error) {
      console.error(chalk.red('❌ 配置操作失败:'), error.message);
      process.exit(1);
    }
  });

// 状态查看命令
program
  .command('status')
  .description('查看部署状态')
  .option('-e, --env <environment>', '环境名称', 'staging')
  .action(async (options) => {
    try {
      await showStatus(options.env);
    } catch (error) {
      console.error(chalk.red('❌ 获取状态失败:'), error.message);
    }
  });

// 日志查看命令
program
  .command('logs')
  .description('查看应用日志')
  .option('-e, --env <environment>', '环境名称', 'staging')
  .option('-n, --lines <number>', '日志行数', '50')
  .option('-f, --follow', '实时跟踪日志')
  .action(async (options) => {
    try {
      await showLogs(options);
    } catch (error) {
      console.error(chalk.red('❌ 获取日志失败:'), error.message);
    }
  });

// 快速部署命令（交互式）
program
  .command('quick')
  .description('快速交互式部署')
  .action(async () => {
    const inquirer = require('inquirer');
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'env',
        message: '选择部署环境:',
        choices: ['development', 'staging', 'production'],
        default: 'staging'
      },
      {
        type: 'input',
        name: 'branch',
        message: '选择分支:',
        default: 'main'
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: '确认部署？',
        default: false
      }
    ]);
    
    if (answers.confirm) {
      await deployProject({
        env: answers.env,
        branch: answers.branch
      });
    } else {
      console.log(chalk.yellow('部署已取消'));
    }
  });

// 解析命令行参数
program.parse(process.argv);

// 如果没有参数，显示帮助
if (!process.argv.slice(2).length) {
  program.outputHelp();
}