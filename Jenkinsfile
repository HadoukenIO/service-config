pipeline {

    agent { label 'linux-slave' }

    stages {
        stage('Build & Deploy (Staging)') {
            agent { label 'linux-slave' }
            when { branch "develop" }
            steps {
                script {
                    GIT_SHORT_SHA = sh ( script: "git rev-parse --short HEAD", returnStdout: true ).trim()
                    PKG_VERSION = sh ( script: "node -pe \"require('./package.json').version\"", returnStdout: true ).trim()
                    BUILD_VERSION = PKG_VERSION + "-alpha." + env.BUILD_NUMBER
                }

                sh "npm i"
                sh "npm run build"
                sh "echo ${GIT_SHORT_SHA} > ./dist/SHA.txt"
                
                dir('./dist'){                   
                    withCredentials([string(credentialsId: "NPM_TOKEN_WRITE_2", variable: 'NPM_TOKEN')]) {
                        sh "echo //registry.npmjs.org/:_authToken=$NPM_TOKEN > $WORKSPACE/dist/.npmrc"
                    }
                    
                    echo "publishing pre-release version to npm: " + BUILD_VERSION
                    sh "npm version --no-git-tag-version " + BUILD_VERSION
                    sh "npm publish --tag alpha"
                    sh "npm version --no-git-tag-version " + PKG_VERSION
                }
            }
        }

        stage('Build & Deploy (Production)') {
            agent { label 'linux-slave' }
            when { branch "master" }
            steps {
                script {
                    GIT_SHORT_SHA = sh ( script: "git rev-parse --short HEAD", returnStdout: true ).trim()
                    PKG_VERSION = sh ( script: "node -pe \"require('./package.json').version\"", returnStdout: true ).trim()
                    BUILD_VERSION = PKG_VERSION
                }

                sh "npm i"
                sh "npm run build"
                sh "echo ${GIT_SHORT_SHA} > ./dist/SHA.txt"

                dir('./dist') {
                    withCredentials([string(credentialsId: "NPM_TOKEN_WRITE_2", variable: 'NPM_TOKEN')]) {
                        sh "echo //registry.npmjs.org/:_authToken=$NPM_TOKEN > $WORKSPACE/dist/.npmrc"
                    }
                    
                    echo "publishing to npm, version: " + BUILD_VERSION
                    sh "npm publish"
                }
            }
        }
    }
}
