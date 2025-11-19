const got = require("got");
const { URL } = require("url");

// ========================================================
// 1) جلب أول Redirect (يدعم كل الروابط المختصرة)
// ========================================================
async function getFinalRedirect(url) {
    try {
        const response = await got(url, {
            followRedirect: false,
            https: { rejectUnauthorized: false }
        });

        // كاين Location ؟ يعني redirect
        if (response.headers.location) {
            return response.headers.location;
        }

        return url;
    } catch (err) {
        console.error("❌ Redirect error:", err.message);
        return url;
    }
}

// ========================================================
// 2) استخراج Product ID من أي رابط AliExpress
// ========================================================
function extractProductId(url) {
    try {
        const u = new URL(url);

        // 1) productIds في query
        if (u.searchParams.has("productIds")) {
            return u.searchParams.get("productIds");
        }

        // 2) redirectUrl
        if (u.searchParams.has("redirectUrl")) {
            const decoded = decodeURIComponent(u.searchParams.get("redirectUrl"));
            const m = decoded.match(/item\/(\d+)\.html/);
            if (m) return m[1];
        }

        // 3) الرابط العادي /item/xxxx.html
        const m = u.pathname.match(/item\/(\d+)\.html/);
        if (m) return m[1];

        return null;
    } catch {
        return null;
    }
}

// ========================================================
// 3) الدالة الأساسية idCatcher
// ========================================================
async function idCatcher(input) {
    if (!input || typeof input !== "string") return null;

    // إذا رقم فقط
    if (/^\d+$/.test(input)) {
        return { id: input };
    }

    // إذا رابط بدون http
    if (!input.startsWith("http")) {
        input = "https://" + input;
    }

    // 1) أخذ أول redirect
    let finalUrl = await getFinalRedirect(input);

    // إذا كان redirect ثاني (بعض روابط s.click تعطي 2 redirects)
    finalUrl = await getFinalRedirect(finalUrl);

    // 2) استخراج ID
    const id = extractProductId(finalUrl);

    return { id, finalUrl };
}

// ========================================================
// 4) جلب preview (عنوان + صورة)
// ========================================================
async function fetchLinkPreview(productId) {
    try {
        const url = "https://linkpreview.xyz/api/get-meta-tags";

        const res = await got(url, {
            searchParams: {
                url: `https://vi.aliexpress.com/item/${productId}.html`
            },
            responseType: "json"
        });

        return {
            title: res.body.title || "",
            image_url: res.body.image || null
        };

    } catch (err) {
        console.error("❌ Preview error:", err.message);
        return null;
    }
}

// ========================================================
// 5) توليد روابط Affiliate (خفيف)
// ========================================================
async function portaffFunction(cookie, ids) {

    const idObj = await idCatcher(ids);
    const productId = idObj?.id;

    if (!productId) throw new Error("❌ لم يتم استخراج Product ID.");

    const sourceTypes = {
        "555": "coin",
        "620": "point",
        "562": "super",
        "570": "limit",
        "561": "ther3"
    };

    let result = { aff: {}, previews: {} };
    let promoRequests = [];

    for (const type in sourceTypes) {
        const name = sourceTypes[type];

        const targetUrl = type === "561"
            ? `https://www.aliexpress.com/ssr/300000512/BundleDeals2?disableNav=YES&pha_manifest=ssr&_immersiveMode=true&productIds=${productId}&aff_fcid=`
            : type === "555"
                ? `https://m.aliexpress.com/p/coin-index/index.html?_immersiveMode=true&from=syicon&productIds=${productId}&aff_fcid=`
                : `https://star.aliexpress.com/share/share.htm?redirectUrl=https%3A%2F%2Fvi.aliexpress.com%2Fitem%2F${productId}.html%3FsourceType%3D${type === "620" ? '620%26channel%3Dcoin' : type}`;

        promoRequests.push(
            got("https://portals.aliexpress.com/tools/linkGenerate/generatePromotionLink.htm", {
                searchParams: {
                    trackId: "default",
                    targetUrl
                },
                headers: {
                    cookie: `xman_t=${cookie};`
                },
                responseType: "json"
            })
                .then(r => ({ type: name, data: r.body.data }))
                .catch(() => ({ type: name, data: null }))
        );
    }

    const promoResults = await Promise.all(promoRequests);

    for (const pr of promoResults) {
        result.aff[pr.type] = pr.data;
    }

    result.previews = await fetchLinkPreview(productId);

    return result;
}
exports.portaffFunction = portaffFunction;
