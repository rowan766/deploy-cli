// deploy-cli 配置模板
// 复制此文件到项目根目录并重命名为 deploy.config.js

module.exports = {
  // 项目信息
  project: {
    name: 'my-project',
    type: 'node', // node, react, vue, static, php, python
    version: '1.0.0'
  },

  // 构建配置
  build: {
    // 本地构建命令
    command: 'npm run build',
    // 构建输出目录
    outputDir: 'dist',
    // 需要上传的文件/目录
    include: [
      'dist/**/*',
      'package.json',
      'package-lock.json'
    ],
    // 排除的文件/目录
    exclude: [
      'node_modules',
      '.git',
      '*.log',
      '.env*'
    ]
  },

  // 环境配置
  environments: {
    // 开发环境
    development: {
      host: 'dev.example.com',
      port: 22,
      username: 'deploy',
      // 认证方式：password 或 privateKey
      auth: {
        type: 'privateKey',
        privateKey: '~/.ssh/id_rsa'
        // 或使用密码
        // type: 'password',
        // password: 'your-password'
      },
      
      // 部署路径
      deployPath: '/var/www/development',
      
      // 备份配置
      backup: {
        enabled: true,
        path: '/var/backups/development',
        keep: 5 // 保留最近5个备份
      },
      
      // 部署钩子
      hooks: {
        // 部署前执行
        beforeDeploy: [
          'echo "开始部署到开发环境"'
        ],
        // 上传后执行
        afterUpload: [
          'cd /var/www/development',
          'npm install --production'
        ],
        // 部署后执行
        afterDeploy: [
          'pm2 restart dev-app',
          'echo "开发环境部署完成"'
        ]
      },
      
      // 健康检查
      healthCheck: {
        url: 'http://dev.example.com/health',
        timeout: 30000,
        retries: 3
      }
    },

    // 测试环境
    staging: {
      host: 'staging.example.com',
      port: 22,
      username: 'deploy',
      auth: {
        type: 'privateKey',
        privateKey: '~/.ssh/id_rsa'
      },
      
      deployPath: '/var/www/staging',
      
      backup: {
        enabled: true,
        path: '/var/backups/staging',
        keep: 10
      },
      
      hooks: {
        beforeDeploy: [
          'echo "开始部署到测试环境"',
          'npm run test' // 运行测试
        ],
        afterUpload: [
          'cd /var/www/staging',
          'npm install --production',
          'npm run build:staging'
        ],
        afterDeploy: [
          'pm2 restart staging-app',
          'nginx -s reload',
          'echo "测试环境部署完成"'
        ]
      },
      
      healthCheck: {
        url: 'http://staging.example.com/health',
        timeout: 30000,
        retries: 5
      }
    },

    // 生产环境
    production: {
      host: 'prod.example.com',
      port: 22,
      username: 'deploy',
      auth: {
        type: 'privateKey',
        privateKey: '~/.ssh/id_rsa'
      },
      
      deployPath: '/var/www/production',
      
      backup: {
        enabled: true,
        path: '/var/backups/production',
        keep: 20
      },
      
      // 生产环境需要确认
      requireConfirmation: true,
      
      // 灰度发布配置
      canary: {
        enabled: false,
        percentage: 10,
        duration: 300 // 5分钟
      },
      
      hooks: {
        beforeDeploy: [
          'echo "开始部署到生产环境"',
          'npm run test',
          'npm run lint'
        ],
        afterUpload: [
          'cd /var/www/production',
          'npm install --production --silent',
          'npm run build:production'
        ],
        afterDeploy: [
          'pm2 restart prod-app --wait-ready',
          'nginx -s reload',
          'echo "生产环境部署完成"'
        ],
        onSuccess: [
          'echo "生产环境部署成功"',
          'curl -X POST https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK -d "payload={\"text\":\"生产环境部署成功\"}"'
        ],
        onFailure: [
          'echo "生产环境部署失败，开始回滚"',
          'pm2 restart prod-app-backup'
        ]
      },
      
      healthCheck: {
        url: 'https://example.com/health',
        timeout: 60000,
        retries: 10,
        interval: 5000
      }
    }
  },

  // 全局配置
  global: {
    // 超时时间
    timeout: 300000, // 5分钟
    
    // 重试次数
    retries: 3,
    
    // 并发连接数
    concurrency: 1,
    
    // 日志配置
    logging: {
      level: 'info', // error, warn, info, debug
      file: 'deploy.log'
    },
    
    // 通知配置
    notifications: {
      slack: {
        enabled: false,
        webhook: 'https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK',
        channel: '#deployments',
        username: 'Deploy Bot'
      },
      email: {
        enabled: false,
        smtp: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: 'your-email@gmail.com',
            pass: 'your-password'
          }
        },
        from: 'deploy@example.com',
        to: ['team@example.com']
      }
    }
  },

  // 高级配置
  advanced: {
    // 是否启用增量部署
    incrementalDeploy: false,
    
    // 文件压缩
    compression: {
      enabled: true,
      algorithm: 'gzip'
    },
    
    // 文件传输配置
    transfer: {
      chunkSize: 1024 * 1024, // 1MB
      maxRetries: 3
    },
    
    // 回滚配置
    rollback: {
      enabled: true,
      keepVersions: 5,
      autoRollback: false
    }
  }
};