const { Telegraf } = require('telegraf');

// Set up your Telegram bot token
const bot = new Telegraf('6326100458:AAFDir6UR_yLZeSIhpiIFmUzaednzbw8p9A');

// Define the required channel and group IDs
const channelId = -1001925572759;  // Replace with the actual channel ID
const groupId = -1001803982065;        // Replace with the actual group ID


// Middleware to check if the member is in the group and has joined the channel
const checkMembershipAndForward = async (ctx, next) => {
    const userId = ctx.message.from.id;

    try {
        // Check if the user is a member of the channel
        const channelMember = await bot.telegram.getChatMember(channelId, userId);
        const groupMember = await bot.telegram.getChatMember(groupId, userId);

        if (channelMember.status === 'member' || channelMember.status === 'administrator' || channelMember.status === 'creator') {
            // User is a member of the group, proceed to the next middleware
            return next();
        } else {
            // User is not a member of the group
            return ctx.reply('Cannot send, make sure joined in @kutangchannel & @kutangpostt');
        }

        if (groupMember.status === 'member' || groupMember.status === 'administrator' || groupMember.status === 'creator') {
            // User is a member of the group, proceed to the next middleware
            return next();
        } else {
            // User is not a member of the group
            return ctx.reply('Cannot send, make sure joined in @kutangchannel & @kutangpostt');
        }
    } catch (error) {
        console.error('Error checking membership and forwarding:', error);
        ctx.reply('An error occurred while checking membership and forwarding.');
    }
};

// Middleware to forward the message if it contains specific words
const forwardMessageWithKeywords = async (ctx) => {
    const messageText = ctx.message.text.toLowerCase();

    // Add your desired keywords
    const keywords = ['#kutangboy', '#kutanggirl','#kutangboys', '#kutanggirls'];

    if (keywords.some(keyword => messageText.includes(keyword))) {
        // Add your logic to forward the message to the required channel
        try {
            await bot.telegram.forwardMessage(channelId, ctx.message.chat.id, ctx.message.message_id);
            return ctx.reply('Message forwarded successfully!');
        } catch (error) {
            console.error('Error forwarding message:', error);
            return ctx.reply('An error occurred while forwarding the message.');
        }
    }

    // If the message doesn't contain the required keywords, allow it without forwarding
    return Promise.resolve();
};

// Apply middleware to check membership and forward messages
bot.on('text', checkMembershipAndForward, forwardMessageWithKeywords);

bot.launch();