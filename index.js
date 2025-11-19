const { Telegraf } = require('telegraf');
const express = require('express');
const https = require('https');
const app = express();
const { portaffFunction } = require('./afflink');

const bot = new Telegraf(process.env.token);
const cookies = process.env.cook;
const Channel = process.env.channel;

app.use(express.json());
app.use(bot.webhookCallback('/bot'));

app.get('/', (req, res) => res.sendStatus(200));
app.get('/ping', (req, res) => res.status(200).json({ message: 'Ping successful' }));

function keepAppRunning() {
    setInterval(() => {
        https.get(`${process.env.RENDER_EXTERNAL_URL}/ping`, (resp) => {
            if (resp.statusCode === 200) {
                console.log('Ping successful');
            } else {
                console.error('Ping failed');
            }
        });
    }, 5 * 60 * 1000);
}

async function isUserSubscribed(user_id) {
    try {
        const idChannel = Channel.replace('https://t.me/', '@');
        const user_info = await bot.telegram.getChatMember(idChannel, user_id);
        console.log(user_info);
        return ['member', 'administrator', 'creator'].includes(user_info.status);
    } catch (e) {
        console.error(`حدث خطأ: ${e.message}`);
        return false;
    }
}

bot.command(['start', 'help'], async (ctx) => {
    const replyMarkup = {
        inline_keyboard: [
            [{ text: 'اشترك في القناة 📢', url: Channel }],
        ],
    };

    const welcomeMessage = `
مرحبًا بكم في البوت 🤖
مهمة هذا البوت هي معرفة أقل سعر للمنتج المراد شراءه 😍 حيث يعطيك 3 روابط:

⏪ رابط تخفيض النقاط (العملات): زيادة التخفيض حتى 24% حسب المنتج 🔥
⏪ رابط عروض السوبر 🔥
⏪ رابط العرض المحدود 🔥

🔴 انسخ رابط المنتج وضعه في البوت وقارن بين الروابط الثلاث واشتري بأقل سعر!
قم بتثبيت البوت (épinglée) لتسهيل الوصول إليه.
    `;

    await ctx.reply(welcomeMessage, { reply_markup: replyMarkup });
});

bot.on('text', async (ctx) => {
    const userIdToCheck = ctx.message.from.id;

    if (await isUserSubscribed(userIdToCheck)) {
        try {
            const text = ctx.message.text;

            if (text.includes('aliexpress.com')) {
                const sent = await ctx.sendMessage('⏳ جاري البحث عن أفضل العروض 🔍');

                const extractLinks = (text) => {
                    const urlPattern = /http[s]?:\/\/(?:[a-zA-Z0-9$-_@.&+!*\\(\\),]|(?:%[0-9a-fA-F]{2}))+/
                    return text.match(urlPattern) || [];
                };

                const links = extractLinks(text);
                if (!links[0]) {
                    return ctx.sendMessage("🚨 لم يتم العثور على رابط صحيح في الرسالة");
                }

                portaffFunction(cookies, links[0]).then((coinPi) => {
                    try {
                        if (!coinPi.previews.image_url) {
                            ctx.sendMessage("🚨 عذرًا، البوت يدعم فقط روابط منتجات AliExpress");
                            return;
                        }

                        ctx.replyWithPhoto({ url: coinPi.previews.image_url }, {
                    caption: `

${coinPi.previews.title}


<b>>-----------« تخفيض  🎉 »>-----------</b>


📌رابط تخفيض العملات الكامل         👇
${coinPi.aff.coin}

📌رابط العملات.         👇
${coinPi.aff.point}

📌رابط السوبر ديلز     👇
${coinPi.aff.super}

📌رابط العرض المحدود   👇
${coinPi.aff.limit}

ابط الـ  bundle deals  👇
${coinPi.aff.ther3}


------🔥 الصفحات التخفيضية 🔥------

قم بتغيير البلد إلى كندا 🇨🇦وتغيير العملة إلى الدولار

` ,
                            parse_mode: "HTML",
                        }).then(() => {
                            ctx.deleteMessage(sent.message_id);
                        });
                    } catch (e) {
                        console.error(e);
                        ctx.sendMessage("⚠️ حدث خطأ أثناء معالجة الرابط.");
                    }
                }).catch((err) => {
                    console.error(err);
                    ctx.sendMessage("❌ لم نتمكن من جلب البيانات من الرابط.");
                });

            } else {
                await ctx.sendMessage('🚫 الرجاء إرسال رابط من AliExpress فقط.');
            }

        } catch (e) {
            console.error(e);
            await ctx.sendMessage('❗ حدث خطأ غير متوقع. الرجاء المحاولة لاحقًا.');
        }

    } else {
        const replyMarkup2 = {
            inline_keyboard: [
                [{ text: 'اشترك الآن ✅', url: Channel }],
            ],
        };
        ctx.reply('⚠️ أنت غير مشترك في القناة. يرجى الاشتراك أولًا:', { reply_markup: replyMarkup2 });
    }
});

app.listen(3000, () => {
    bot.telegram.setWebhook(`${process.env.RENDER_EXTERNAL_URL}/bot`)
        .then(() => {
            console.log('✅ Webhook Set و السيرفر يعمل على المنفذ 3000');
            keepAppRunning();
        });
});
