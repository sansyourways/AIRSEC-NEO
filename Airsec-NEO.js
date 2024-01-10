require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const fs = require('fs');
const natural = require('natural');
const tf = require('@tensorflow/tfjs-node');
const axios = require('axios');
const fetch = require('node-fetch');
const weather = require('openweather-apis');
// Replace TLSSocket' with the EventEmitter causing the warning if it's different
const EventEmitter = require('events');
EventEmitter.defaultMaxListeners = 100; // Change the number to the maximum allowed

// Initialize the bot with your Telegram Bot Token
const bot = new Telegraf(process.env.BOT_TOKEN);

const subscribeChannelId = ['@altersival', '@altersivalpm', '@cherpan13' ,'@cherpan133']; // Replace with your channel username

const forwardChannelId = '@altersivalpm'; // Replace with your forward channel username

const validPrefixes = ['#vmale', '#vfemale', '#vsfs', '#vfind'];

// Track forwarded messages count per user and reset at 1 AM daily
const forwardedCounts = new Map();
const resetTime = 1; // 1 AM

// Dictionary to store poll data
const polls = {};

// Set your OpenWeatherMap API key
weather.setAPPID('YOUROPENWEATHER_TOKEN');

// Array to store bot owner/admin IDs
let admins = ['@sansyourways']; // Assuming the second ID is a numerical user ID

// Define staffList as an empty array
let staffList = [];

// Define isBotEnabled as a global variable or set it to a default value
let isBotEnabled = true; // Or false, depending on your bot's intended initial statusbar

// Error logging function
function logError(error, ctx = null) {
  const currentTime = new Date().toISOString();
  let errorMessage = `Error occurred at: ${currentTime}\n`;

  if (ctx) {
    errorMessage += `Error: ${error}\nUpdate Type: ${ctx.updateType}\nContext: ${JSON.stringify(ctx)}\n\n`;
  } else {
    errorMessage += `Error: ${error}\n\n`;
  }

  fs.appendFile('error.log', errorMessage, (err) => {
    if (err) {
      console.error('Error logging failed:', err);
    }
  });
}

// Function to check if a user is an admin
function isAdminUser(userID) {
  return admins.includes(userID);
}

// Function to check if the bot is enabled
function isBotOn() {
  return isBotEnabled;
}

// Function to check if the user is an admin
function isAdminUser(ctx) {
  const userID = ctx.message.from.id;
  return ctx.getChatAdministrators().then(admins => admins.some(admin => admin.user.id === userID));
}

// Function to measure response time
function measureResponseTime(ctx) {
  const startTime = Date.now();
  ctx.reply('Measuring bot response time...')
    .then(() => {
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      ctx.reply(`Bot response time: ${responseTime}ms`);
    })
    .catch((error) => {
      logError(error);
      ctx.reply('Failed to measure response time.');
    });
}

try {

// Command to start the bot with a friendly greeting
bot.start((ctx) => {
  ctx.reply('👋 Welcome to AIRSEC-NEO! Use /help to see available commands.')
    .then(() => measureResponseTime(ctx))
    .catch((error) => {
      logError(error);
      ctx.reply('Failed to measure response time.');
    });
});

// Command to display help list
bot.command('help', (ctx) => {
  const helpMessage = `
🤖 *Available commands* 🤖\n
/start - Start the bot
/status - Check bot status
/responsetime - Measure bot response time
/toggle - Turn bot on/off
/addadmin - Add admin (reply to a user)
/removeadmin - Remove admin (reply to a user)
/listadmins - List existing admins
/addstaff - Add staff to the list
/removestaff - Remove staff from the list
/stafflist - Show list of staff members
/showtime - Show date and time live for 5 seconds
/calculate - Perform basic arithmetic
/weather - Get weather forecast
/horoscope - Daily horoscopes
/broadcastgroups - Broadcast message to groups
/broadcastprivate - Broadcast message privately
=================================\n
*Polling Commands:*\n
/createpoll - Start a new poll in the group chat
/vote [option] - Vote for a specific option in an active poll
/pollresults - Display current poll results
=================================\n
/prefixes - Display available prefixes
/help - Show this help message
`;
  ctx.replyWithMarkdown(helpMessage);
});

// Command to check bot status
bot.command('status', (ctx) => {
  const status = isBotEnabled ? 'enabled' : 'disabled';
  ctx.reply(`Bot is currently ${status}.`);
});

// Command to toggle bot enable/disable (Only admin staff or creator can execute)
bot.command('toggle', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const chatId = ctx.message.chat.id;

    const chatMember = await ctx.telegram.getChatMember(chatId, userId);
    const isAdmin = ['creator', 'administrator'].includes(chatMember.status);

    if (isAdmin || userId === 942993499) {
      isBotEnabled = !isBotEnabled;
      const status = isBotEnabled ? 'enabled' : 'disabled';
      ctx.reply(`Bot is now ${status}.`);
    } else {
      ctx.reply('You do not have permission to toggle the bot status.');
    }
  } catch (error) {
    console.error('Error toggling bot status:', error);
    ctx.reply('Sorry, there was an error while toggling the bot status.');
  }
});

// Middleware to check if the bot is enabled before executing commands
bot.use(async (ctx, next) => {
  try {
    const userId = ctx.from.id;
    const isAdmin = ['creator', 'administrator'].includes(ctx.chat.type);

    if (!isBotEnabled && !isAdmin && userId !== 942993499) {
      await ctx.reply('Sorry, the bot is currently disabled. Please try again later.');
      return;
    }
    await next(); // Continue with handling the message
  } catch (error) {
    console.error('Error checking bot status:', error);
    await ctx.reply('Sorry, there was an error while checking the bot status.');
  }
});

// Message handler for forwarding messages
bot.on('message', async (ctx, next) => {
  try {
    const messageText = ctx.message.text || '';
    const userId = ctx.from.id;
    const currentTime = new Date();
    const currentHour = currentTime.getHours();

    if (currentHour === 1) {
      forwardedCounts.delete(userId);
      await ctx.reply('Your message forwarding limit has been reset. You can now forward messages again.');
    }

    if (ctx.chat.type === 'private' && !messageText.startsWith('/')) {
      const userForwardedCount = forwardedCounts.get(userId) || 0;

      if (userForwardedCount >= 3) {
        await ctx.reply('You have reached the limit for forwarding messages today.');
        return;
      }

      let isMemberOfAllChannels = true;

      for (const channel of subscribeChannelId) {
        const isMember = await bot.telegram.getChatMember(channel, userId)
          .then(result => ['member', 'creator', 'administrator'].includes(result.status))
          .catch(error => {
            console.error(`Error checking membership for ${channel}:`, error);
            return false;
          });

        if (!isMember) {
          isMemberOfAllChannels = false;
          break;
        }
      }

      if (!isMemberOfAllChannels) {
        await ctx.reply('Please join all the required channels before using this command.');
        return;
      }

      await bot.telegram.forwardMessage(forwardChannelId, ctx.message.chat.id, ctx.message.message_id);
      forwardedCounts.set(userId, userForwardedCount + 1);

      const remainingForwards = 3 - (userForwardedCount + 1);
      const resetTime = currentHour < 1 ? `until 1 AM` : `at 1 AM`;
      const resetNotification = `You have ${remainingForwards} message forwards left. The limit will reset ${resetTime}.`;

      await ctx.reply(`Message forwarded successfully!\n\n${resetNotification}`);
    }

    await next(); // Continue with next middleware or handler
  } catch (error) {
    console.error('Error:', error);
    await ctx.reply('An error occurred while processing your request.');
  }
});

// Command to display live date and time for 5 seconds
bot.command('showtime', async (ctx) => {
  try {
    if (!ctx || !ctx.message || !ctx.message.chat || !isBotEnabled) {
      ctx.reply('Sorry, the bot is currently disabled. Please try again later.');
      return;
    }

    const chatID = ctx.message.chat.id;

    // Function to send live date and time
    const sendLiveTime = () => {
      const currentTime = new Date().toLocaleString();
      ctx.telegram.sendMessage(chatID, `Current date and time: ${currentTime}`);

      // Wait for 5 seconds before stopping the live time display
      setTimeout(() => {
        ctx.telegram.sendMessage(chatID, 'Live time display ended.');
      }, 5000); // 5000 milliseconds = 5 seconds
    };

    // Send live time only if the bot is enabled
    sendLiveTime();
  } catch (error) {
    console.error('Error displaying live time:', error);
    ctx.reply('Sorry, there was an error while displaying live time.');
  }
});

// Command to perform calculations
bot.command('calculate', (ctx) => {
  try {
    const messageText = ctx.message.text;
    const commandParts = messageText.split(' '); // Split the message into parts
    const operator = commandParts[1]; // Get the operator (+, -, *, /)
    const numbers = commandParts.slice(2).map(parseFloat); // Extract numbers

    let result;
    switch (operator) {
      case '+':
        result = numbers.reduce((acc, curr) => acc + curr, 0); // Addition
        break;
      case '-':
        result = numbers.reduce((acc, curr) => acc - curr); // Subtraction
        break;
      case '*':
        result = numbers.reduce((acc, curr) => acc * curr, 1); // Multiplication
        break;
      case '/':
        result = numbers.reduce((acc, curr) => acc / curr); // Division
        break;
      default:
        ctx.reply('Invalid operator. Use +, -, *, /');
        return;
    }

    ctx.reply(`Result: ${result}`);
  } catch (error) {
    console.error('Error calculating:', error);
    ctx.reply('Sorry, there was an error while performing the calculation.');
  }
});

// Command to get weather forecast for a city
bot.command('weather', async (ctx) => {
  try {
    const messageText = ctx.message.text;
    const parts = messageText.split(' ');
    parts.shift(); // Remove the command itself

    if (parts.length === 0) {
      ctx.reply('Please provide the name of the city to get the weather forecast.');
      return;
    }

    const city = parts.join(' ');

    // Set the city for weather forecast
    weather.setCity(city);

    // Retrieve weather information
    weather.getAllWeather(function (err, JSONObj) {
      if (err) {
        console.error('Weather API error:', err);
        ctx.reply('Sorry, there was an error fetching the weather information.');
        return;
      }

      const weatherDesc = JSONObj.weather[0].description;
      const temperature = JSONObj.main.temp;
      const humidity = JSONObj.main.humidity;
      const windSpeed = JSONObj.wind.speed;

      const forecastMessage = `
      Weather forecast for ${city}:
      Description: ${weatherDesc}
      Temperature: ${temperature}°C
      Humidity: ${humidity}%
      Wind Speed: ${windSpeed} m/s
      `;

      ctx.reply(forecastMessage);
    });
  } catch (error) {
    console.error('Error fetching weather forecast:', error);
    ctx.reply('Sorry, there was an error while fetching the weather forecast.');
  }
});

bot.command('horoscope', async (ctx) => {
  const zodiacSigns = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
  const userSign = (ctx.message.text.split(' ')[1] || '').toLowerCase();

  // Extract the zodiac sign from the command
  if (!userSign || !zodiacSigns.includes(userSign)) {
    ctx.reply('Please provide a valid zodiac sign. Usage: /horoscope [zodiac_sign]');
    return;
  }

  try {
    const response = await axios.get(`https://aztro.sameerkumar.website/?sign=${userSign}&day=today`, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const { data } = response;

    ctx.reply(`Horoscope for ${userSign.toUpperCase()} - ${data.current_date}:\n${data.description}`);
  } catch (error) {
    console.error('Error fetching horoscope:', error);
    ctx.reply('Sorry, there was an error while fetching the horoscope.');
  }
});

// Command to display available prefixes
bot.command('prefixes', (ctx) => {
  const availablePrefixes = validPrefixes.join(', '); // Join prefixes into a string for display
  ctx.reply(`Available prefixes: ${availablePrefixes}`);
});

// Command to measure bot response time
bot.command('responsetime', (ctx) => {
  measureResponseTime(ctx);
});

// Commands accessible only by admins
bot.command('addadmin', (ctx) => {
  const senderUserID = ctx.from.id; // Get the user ID of the user who sent the command

  if (isAdminUser(senderUserID)) {
    const newAdmin = ctx.message.text.split(' ')[1]; // Extract the username or ID of the new admin from the command
    if (!admins.includes(newAdmin)) {
      admins.push(newAdmin);
      ctx.reply(`${newAdmin} has been added as an admin.`);
    } else {
      ctx.reply(`${newAdmin} is already an admin.`);
    }
  } else {
    ctx.reply(`Sorry, only admins can use this command.`);
  }
});

bot.command('removeadmin', (ctx) => {
  const senderUserID = ctx.from.id; // Get the user ID of the user who sent the command

  if (isAdminUser(senderUserID)) {
    const removeAdmin = ctx.message.text.split(' ')[1]; // Extract the username or ID of the admin to be removed from the command
    if (admins.includes(removeAdmin)) {
      admins = admins.filter((admin) => admin !== removeAdmin);
      ctx.reply(`${removeAdmin} has been removed as an admin.`);
    } else {
      ctx.reply(`${removeAdmin} is not an admin.`);
    }
  } else {
    ctx.reply(`Sorry, only admins can use this command.`);
  }
});

bot.command('listadmins', (ctx) => {
  const senderUserID = ctx.from.id; // Get the user ID of the user who sent the command

  if (isAdminUser(senderUserID)) {
    const adminList = admins.join('\n'); // Join admin usernames or IDs with line breaks for better readability
    ctx.reply(`List of admins:\n${adminList}`);
  } else {
    ctx.reply(`Sorry, only admins can use this command.`);
  }
});

// Command to add staff (only accessible by admins)
bot.command('addstaff', async (ctx) => {
  try {
    const isUserAdmin = await isAdminUser(ctx);
    if (!isUserAdmin) {
      ctx.reply('You do not have permission to add staff.');
      return;
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');
    parts.shift(); // Remove the command itself

    if (parts.length === 0) {
      ctx.reply('Please provide the username of the user to add as staff.');
      return;
    }

    const username = parts[0];
    staffList.push(username);
    ctx.reply(`User @${username} has been added as staff.`);
  } catch (error) {
    console.error('Error adding staff:', error);
    ctx.reply('Sorry, there was an error while adding staff.');
  }
});

// Command to remove staff (only accessible by admins)
bot.command('removestaff', async (ctx) => {
  try {
    const isUserAdmin = await isAdminUser(ctx);
    if (!isUserAdmin) {
      ctx.reply('You do not have permission to remove staff.');
      return;
    }

    const messageText = ctx.message.text;
    const parts = messageText.split(' ');
    parts.shift(); // Remove the command itself

    if (parts.length === 0) {
      ctx.reply('Please provide the username of the user to remove from staff.');
      return;
    }

    const username = parts[0];
    const index = staffList.indexOf(username);
    if (index !== -1) {
      staffList.splice(index, 1);
      ctx.reply(`User @${username} has been removed from staff.`);
    } else {
      ctx.reply(`User @${username} is not in the staff list.`);
    }
  } catch (error) {
    console.error('Error removing staff:', error);
    ctx.reply('Sorry, there was an error while removing staff.');
  }
});

// Command to display staff list (only accessible by admins)
bot.command('stafflist', async (ctx) => {
  try {
    const isUserAdmin = await isAdminUser(ctx);
    if (!isUserAdmin) {
      ctx.reply('You do not have permission to view the staff list.');
      return;
    }

    const list = staffList.length > 0 ? staffList.map(username => `@${username}`).join('\n') : 'No staff added yet.';
    ctx.reply(`Current staff members:\n${list}`);
  } catch (error) {
    console.error('Error displaying staff list:', error);
    ctx.reply('Sorry, there was an error while displaying the staff list.');
  }
});

// Command to broadcast message to groups (only for admins)
bot.command('broadcastgroups', (ctx) => {
  const isAdminUser = isAdminUser(ctx.message.from.username); // Check if the user is an admin

  if (!isAdminUser) {
    ctx.reply('Only admins can use this command.');
    return;
  }

  const message = ctx.message.text.replace('/broadcastgroups ', ''); // Extract the message to broadcast

  if (!message) {
    ctx.reply('Please provide a message to broadcast to groups. Usage: /broadcastgroups [your_message]');
    return;
  }

  // Broadcast to groups
  bot.telegram.getMyCommands().then(commands => {
    commands.forEach(command => {
      if (command.type === 'group') {
        bot.telegram.sendMessage(command.id, message);
      }
    });
  });

  ctx.reply('Broadcast sent to groups.');
});

// Command to broadcast message to private chats (only for admins)
bot.command('broadcastprivate', (ctx) => {
  const isAdminUser = isAdminUser(ctx.message.from.username); // Check if the user is an admin

  if (!isAdminUser) {
    ctx.reply('Only admins can use this command.');
    return;
  }

  const message = ctx.message.text.replace('/broadcastprivate ', ''); // Extract the message to broadcast

  if (!message) {
    ctx.reply('Please provide a message to broadcast to private chats. Usage: /broadcastprivate [your_message]');
    return;
  }

  // Broadcast to private chats
  bot.telegram.getMyCommands().then(commands => {
    commands.forEach(command => {
      if (command.type === 'private') {
        bot.telegram.sendMessage(command.id, message);
      }
    });
  });

  ctx.reply('Broadcast sent to private chats.');
});

} catch (error) {
  // Handle any uncaught exceptions within the bot's logic
  logError(`Unhandled Exception: ${error}`);
}

// Error handling for asynchronous errors in the bot
bot.catch((err, ctx) => {
  logError(err, ctx);
});

// Launch the bot
bot.launch()
  .then(() => {
    console.log('Bot started');
  })
  .catch((err) => {
    console.error('Error starting bot:', err);
  });
