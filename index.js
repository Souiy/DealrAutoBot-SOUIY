import axios from 'axios';
import fs from 'fs/promises';
import readline from 'readline';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import chalk from 'chalk';
import cfonts from 'cfonts';
import ora from 'ora';

function delay(seconds) {
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function countdown(ms) {
  const seconds = Math.floor(ms / 1000);
  const spinner = ora().start();
  for (let i = seconds; i > 0; i--) {
    spinner.text = chalk.gray(` Waiting ${i} Seconds Before Next Process...`);
    await delay(1);
  }
  spinner.stop(); 
}

function centerText(text, color = 'yellowBright') {
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.length;
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  return ' '.repeat(padding) + chalk[color](text);
}

function shorten(str, frontLen = 6, backLen = 4) {
  if (!str || str.length <= frontLen + backLen) return str;
  return `${str.slice(0, frontLen)}....${str.slice(-backLen)}`;
}

async function readTokens() {
  try {
    const data = await fs.readFile('token.txt', 'utf-8');
    return data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  } catch (error) {
    console.error(chalk.red(`Error membaca token.txt: ${error.message}`));
    return [];
  }
}

async function readProxies() {
  try {
    const data = await fs.readFile('proxy.txt', 'utf-8');
    const proxies = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (proxies.length === 0) {
      console.log(chalk.yellow('File proxy.txt kosong. Melanjutkan tanpa proxy.'));
    }
    return proxies;
  } catch (error) {
    console.log(chalk.yellow('File proxy.txt tidak ditemukan. Melanjutkan tanpa proxy.'));
    return [];
  }
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

function getHeaders(token = '') {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Content-Type': 'application/json',
    'Origin': 'https://dealr.fun',
    'Referer': 'https://dealr.fun/',
    'Authorization': `Bearer ${token}`
  };
}

function getAxiosConfig(token = null, proxy = null) {
  const config = {
    headers: getHeaders(token),
  };
  if (proxy) {
    if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
      config.httpsAgent = new HttpsProxyAgent(proxy);
    } else if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) {
      config.httpsAgent = new SocksProxyAgent(proxy);
    }
  }
  return config;
}

async function getPublicIP(proxy) {
  try {
    const config = proxy ? { httpsAgent: proxy.startsWith('http') ? new HttpsProxyAgent(proxy) : new SocksProxyAgent(proxy) } : {};
    const response = await axios.get('https://api.ipify.org?format=json', config);
    return response.data.ip;
  } catch (error) {
    return 'Error getting IP';
  }
}

async function getUserInfo(token, proxy) {
  const spinner = ora(' Getting User Info...').start();
  try {
    const response = await axios.get('https://api.dealr.fun/v1/users/profile', getAxiosConfig(token, proxy));
    const data = response.data.data;
    spinner.succeed(chalk.greenBright(' User Info Received'));
    return { userId: data.id, userName: data.name };
  } catch (error) {
    spinner.fail(chalk.redBright(` Failed Getting User Info: ${error.message}`));
    return null;
  }
}

async function getMissions(token, proxy) {
  const spinner = ora(' Getting Missions List...').start();
  try {
    const response = await axios.get('https://api.dealr.fun/v1/missions', getAxiosConfig(token, proxy));
    const missions = response.data.data.map(mission => ({
      id: mission.id,
      name: mission.name,
      status: mission.status
    }));
    spinner.succeed(chalk.greenBright(' Missions List Received\n'));
    return missions;
  } catch (error) {
    spinner.fail(chalk.redBright(` Failed Getting Missions: ${error.message}`));
    return [];
  }
}

async function completeMission(missionId, missionName, token, proxy) {
  if (!missionName) {
    missionName = 'Unknown Mission';
  }
  const spinner = ora(` Completing "${missionName}"...`).start();
  try {
    const response = await axios.post(
      `https://api.dealr.fun/v1/missions/${missionId}/finish`,
      { missionID: missionId },
      getAxiosConfig(token, proxy)
    );
    if (response.data.code === 2000) {
      spinner.succeed(chalk.greenBright(` Task "${missionName}" Completed`));
      return true;
    } else {
      spinner.fail(chalk.redBright(` Task "${missionName}" Failed: ${response.data.message}`));
      return false;
    }
  } catch (error) {
    spinner.fail(chalk.redBright(` Failed Completing "${missionName}": ${error.message}`));
    return false;
  }
}

async function getPointsBalance(token, proxy) {
  const spinner = ora(' Getting Points Balance...').start();
  try {
    const response = await axios.get('https://api.dealr.fun/v1/points/balance', getAxiosConfig(token, proxy));
    const points = response.data.data.point;
    spinner.succeed(chalk.greenBright(` Total Points: ${points}`));
    return points;
  } catch (error) {
    spinner.fail(chalk.redBright(` Failed Getting Points: ${error.message}`));
    return null;
  }
}

async function processAccount(token, proxy) {
  const userInfo = await getUserInfo(token, proxy);
  if (!userInfo) {
    console.error(chalk.red(`Token tidak valid atau user tidak ditemukan`));
    return;
  }
  const { userId, userName } = userInfo;
  console.log();
  console.log(chalk.bold.whiteBright(`User ID   : ${shorten(userId)}`));
  console.log(chalk.bold.whiteBright(`UserName  : ${userName}`));
  const ip = await getPublicIP(proxy);
  console.log(chalk.bold.whiteBright(`IP yang Digunakan: ${ip}`));
  console.log(chalk.bold.cyanBright('='.repeat(80)));
  console.log();

  const missions = await getMissions(token, proxy);
  if (missions.length === 0) {
    console.log(chalk.yellow('Tidak ada misi yang tersedia.'));
    return;
  }

  const completedMissions = missions.filter(m => m.status === 'completed');
  const incompleteMissions = missions.filter(m => m.status === 'not_completed' || m.status === 'in_progress');

  console.log(chalk.bold.greenBright('Mission Already Completed:'));
  if (completedMissions.length === 0) {
    console.log(chalk.gray('  No Mission Already Completed.'));
  } else {
    completedMissions.forEach(m => console.log(chalk.bold.greenBright(`  ☑  Task ${m.name} Done `)));
  }

  console.log(chalk.bold.yellowBright('\n Uncompleted Mission:'));
  if (incompleteMissions.length === 0) {
    console.log(chalk.gray('  No Uncompleted Mission.'));
  } else {
    incompleteMissions.forEach(m => console.log(chalk.bold.yellowBright(`  🚫 Task ${m.name} ${m.status === 'in_progress' ? 'In Progress' : 'Belum Dikerjakan'}`)));
  }
  console.log(chalk.bold.cyanBright('='.repeat(80)));
  console.log();

  for (const mission of incompleteMissions) {
    await completeMission(mission.id, mission.name, token, proxy);
    const randomDelay = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
    await countdown(randomDelay);
  }

  if (incompleteMissions.length === 0) {
    console.log(chalk.greenBright('All Mission Already Done.'));
  } else {
    console.log(chalk.greenBright('Finished Process All Mission.'));
  }

  await getPointsBalance(token, proxy);
  console.log(chalk.yellowBright(`\nFinish Processed Account: ${userName}`));
}

async function run() {
  cfonts.say('SOUIY', {
    font: 'block',
    align: 'center',
    colors: ['cyan', 'magenta'],
    background: 'transparent',
    letterSpacing: 1,
    lineHeight: 1,
    space: true,
    maxLength: '0'
  });
  console.log(centerText("=== FOLLOW TIKTOK 🚀 : NT SOUIY (@Souiy1) ==="));
  console.log(centerText("✪ Dealr AUTO COMPLETE TASK ✪ \n"));

  const useProxyAns = await askQuestion('Ingin Menggunakan Proxy? (y/n): ');
  const useProxy = useProxyAns.trim().toLowerCase() === 'y';
  let proxies = [];
  if (useProxy) {
    proxies = await readProxies();
    if (proxies.length === 0) {
      console.log(chalk.yellow('Proxy Not Availlable , Continue Without Proxy.'));
    }
  }

  const tokens = await readTokens();
  if (tokens.length === 0) {
    console.log(chalk.red('No Proxy Found on proxy.txt.'));
    return;
  }

  while (true) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
      console.log();
      console.log(chalk.bold.cyanBright('='.repeat(80)));
      console.log(chalk.bold.whiteBright(`Akun: ${i + 1}/${tokens.length}`));
      await processAccount(token, proxy);
    }
    console.log(chalk.grey('\nWaiting 24 Hours Before Next Loop...'));
    await delay(86400);
  }
}

run().catch(error => console.error(chalk.red(`Error: ${error.message}`)));