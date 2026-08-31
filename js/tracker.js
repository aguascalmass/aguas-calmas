/*
============================================================
    AGUAS CALMAS
    TRACKER DE ANALÍTICA
============================================================

Registra:
- Visitante persistente
- Sesiones
- Páginas visitadas
- Tiempo de permanencia
- Tiempo activo
- Tiempo con pestaña oculta
- Scroll máximo
- Resolución y viewport
- Idioma y zona horaria
- Información de conexión
- Referrer
- Lecturas de artículos
- Hitos 25 / 50 / 75 / 100 %
- Lecturas calificadas
============================================================
*/

(function () {
    "use strict";

    /* =====================================================
       CONFIGURACIÓN
       ===================================================== */

    const API_BASE =
        "https://aguas-calmas-analytics.aguas-calmas.workers.dev";

    const SESSION_TIMEOUT = 30 * 60 * 1000;
    const ACTIVITY_INTERVAL = 15000;
    const USER_ACTIVE_TIMEOUT = 60000;

    /* =====================================================
       ALMACENAMIENTO
       ===================================================== */

    const VISITOR_KEY = "aguas_calmas_visitor_id";
    const SESSION_KEY = "aguas_calmas_session_id";
    const SESSION_LAST_ACTIVITY_KEY =
        "aguas_calmas_session_last_activity";

    /* =====================================================
       ESTADO
       ===================================================== */

    let visitorId = null;
    let sessionId = null;
    let pageviewId = null;

    let pageStartedAt = Date.now();
    let activeSeconds = 0;
    let hiddenSeconds = 0;
    let maxScrollPercent = 0;
    let maxScrollPixels = 0;
    let lastUserInteraction = Date.now();

    let initialized = false;
    let finalSent = false;

    let articleId = null;
    let articleReadId = null;
    let articleTrackingEnabled = false;

    /* =====================================================
       IDENTIFICADORES
       ===================================================== */

    function createId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return (
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).substring(2, 15)
        );
    }

    function getVisitorId() {
        try {
            let id = localStorage.getItem(VISITOR_KEY);

            if (!id) {
                id = createId();
                localStorage.setItem(VISITOR_KEY, id);
            }

            return id;
        }
        catch {
            return createId();
        }
    }

    /* =====================================================
       SESIÓN
       ===================================================== */

    function getStoredSession() {
        try {
            const id =
                sessionStorage.getItem(SESSION_KEY);

            const lastActivity =
                Number(
                    sessionStorage.getItem(
                        SESSION_LAST_ACTIVITY_KEY
                    )
                );

            if (!id || !lastActivity) {
                return null;
            }

            if (
                Date.now() - lastActivity >
                SESSION_TIMEOUT
            ) {
                clearSession();
                return null;
            }

            return id;
        }
        catch {
            return null;
        }
    }

    function saveSession(id) {
        try {
            sessionStorage.setItem(
                SESSION_KEY,
                id
            );

            sessionStorage.setItem(
                SESSION_LAST_ACTIVITY_KEY,
                String(Date.now())
            );
        }
        catch {
            /* sin almacenamiento */
        }
    }

    function updateSessionActivity() {
        try {
            sessionStorage.setItem(
                SESSION_LAST_ACTIVITY_KEY,
                String(Date.now())
            );
        }
        catch {
            /* sin almacenamiento */
        }
    }

    function clearSession() {
        try {
            sessionStorage.removeItem(SESSION_KEY);

            sessionStorage.removeItem(
                SESSION_LAST_ACTIVITY_KEY
            );
        }
        catch {
            /* sin almacenamiento */
        }
    }

    /* =====================================================
       DETECCIÓN DE PÁGINA / CONTENIDO
       ===================================================== */

    function detectPageType() {
        const path =
            window.location.pathname.toLowerCase();

        if (path.includes("/articulos/")) {
            return "article";
        }

        if (path.includes("/discos/")) {
            return "album";
        }

        if (path.includes("/poemas/")) {
            return "poem";
        }

        if (
            path === "/" ||
            path.endsWith("/index.html")
        ) {
            return "home";
        }

        return "page";
    }

    function detectContentId() {
        const file =
            window.location.pathname
                .split("/")
                .pop();

        if (
            !file ||
            file.toLowerCase() === "index.html"
        ) {
            return null;
        }

        return file.replace(/\.html?$/i, "");
    }

    function detectArticleTitle() {
        const ogTitle =
            document.querySelector(
                'meta[property="og:title"]'
            );

        if (
            ogTitle &&
            ogTitle.content &&
            ogTitle.content.trim()
        ) {
            return ogTitle.content.trim();
        }

        const h1 =
            document.querySelector("h1");

        if (
            h1 &&
            h1.textContent &&
            h1.textContent.trim()
        ) {
            return h1.textContent.trim();
        }

        if (
            document.title &&
            document.title.trim()
        ) {
            return document.title.trim();
        }

        return detectContentId() || "Artículo";
    }

    /* =====================================================
       DATOS DEL NAVEGADOR
       ===================================================== */

    function getBrowserData() {
        const connection =
            navigator.connection ||
            navigator.mozConnection ||
            navigator.webkitConnection ||
            {};

        let timezone = null;

        try {
            timezone =
                Intl.DateTimeFormat()
                    .resolvedOptions()
                    .timeZone;
        }
        catch {
            timezone = null;
        }

        return {
            language:
                navigator.language || null,

            browser_timezone:
                timezone,

            screen_width:
                screen.width || null,

            screen_height:
                screen.height || null,

            viewport_width:
                window.innerWidth || null,

            viewport_height:
                window.innerHeight || null,

            pixel_ratio:
                window.devicePixelRatio || 1,

            color_depth:
                screen.colorDepth || null,

            cookies_enabled:
                navigator.cookieEnabled === true,

            do_not_track:
                navigator.doNotTrack || null,

            effective_connection_type:
                connection.effectiveType || null,

            downlink_mbps:
                typeof connection.downlink === "number"
                    ? connection.downlink
                    : null,

            rtt_ms:
                typeof connection.rtt === "number"
                    ? connection.rtt
                    : null
        };
    }

    function getPageData() {
        return {
            path:
                window.location.pathname || "/",

            query_string:
                window.location.search
                    ? window.location.search.substring(1)
                    : null,

            title:
                document.title || null,

            page_type:
                detectPageType(),

            content_id:
                detectContentId(),

            referrer:
                document.referrer || null,

            ...getBrowserData()
        };
    }

    /* =====================================================
       PETICIONES
       ===================================================== */

    async function postJson(endpoint, data) {
        const response =
            await fetch(
                API_BASE + endpoint,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(data),

                    keepalive:
                        true
                }
            );

        if (!response.ok) {
            throw new Error(
                "Analytics HTTP " +
                response.status
            );
        }

        return response.json();
    }

    /* =====================================================
       SESIÓN / PAGEVIEW
       ===================================================== */

    async function startNewSession() {
        const result =
            await postJson(
                "/api/session-start",
                {
                    visitor_id:
                        visitorId,

                    ...getPageData()
                }
            );

        if (
            !result ||
            !result.ok
        ) {
            throw new Error(
                "No fue posible iniciar la sesión"
            );
        }

        sessionId =
            result.session_id;

        pageviewId =
            result.pageview_id;

        saveSession(sessionId);
    }

    async function startPageview() {
        const result =
            await postJson(
                "/api/pageview-start",
                {
                    visitor_id:
                        visitorId,

                    session_id:
                        sessionId,

                    ...getPageData()
                }
            );

        if (
            !result ||
            !result.ok
        ) {
            throw new Error(
                "No fue posible crear el pageview"
            );
        }

        pageviewId =
            result.pageview_id;

        updateSessionActivity();
    }

    /* =====================================================
       ARTÍCULOS
       ===================================================== */

    async function startArticleRead() {
        if (
            detectPageType() !== "article" ||
            !visitorId ||
            !sessionId ||
            !pageviewId
        ) {
            return;
        }

        const slug =
            detectContentId();

        if (!slug) {
            return;
        }

        const result =
            await postJson(
                "/api/article/start",
                {
                    visitor_id:
                        visitorId,

                    session_id:
                        sessionId,

                    pageview_id:
                        pageviewId,

                    slug:
                        slug,

                    article_title:
                        detectArticleTitle()
                }
            );

        if (
            !result ||
            !result.ok ||
            !result.read_id
        ) {
            throw new Error(
                "No fue posible iniciar la lectura del artículo"
            );
        }

        articleId =
            result.article_id || null;

        articleReadId =
            result.read_id;

        articleTrackingEnabled =
            true;
    }

    async function sendArticleActivity(
        finalUpdate,
        metrics
    ) {
        if (
            !articleTrackingEnabled ||
            !articleReadId ||
            !visitorId ||
            !sessionId ||
            !pageviewId
        ) {
            return;
        }

        await postJson(
            "/api/article/activity",
            {
                read_id:
                    articleReadId,

                visitor_id:
                    visitorId,

                session_id:
                    sessionId,

                pageview_id:
                    pageviewId,

                duration_seconds:
                    metrics.duration_seconds,

                active_seconds:
                    metrics.active_seconds,

                max_scroll_percent:
                    metrics.max_scroll_percent,

                final:
                    finalUpdate === true
            }
        );
    }

    /* =====================================================
       INTERACCIÓN
       ===================================================== */

    function markUserActivity() {
        lastUserInteraction =
            Date.now();

        updateSessionActivity();
    }

    [
        "mousemove",
        "mousedown",
        "keydown",
        "touchstart",
        "scroll",
        "click"
    ].forEach(function (eventName) {
        window.addEventListener(
            eventName,
            markUserActivity,
            {
                passive: true
            }
        );
    });

    /* =====================================================
       SCROLL
       ===================================================== */

    function updateScroll() {
        const scrollTop =
            window.pageYOffset ||
            document.documentElement.scrollTop ||
            document.body.scrollTop ||
            0;

        const viewportHeight =
            window.innerHeight ||
            document.documentElement.clientHeight ||
            0;

        const documentHeight =
            Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight,
                document.body.offsetHeight,
                document.documentElement.offsetHeight,
                document.body.clientHeight,
                document.documentElement.clientHeight
            );

        const viewedPixels =
            scrollTop +
            viewportHeight;

        if (
            viewedPixels >
            maxScrollPixels
        ) {
            maxScrollPixels =
                viewedPixels;
        }

        if (documentHeight > 0) {
            const percent =
                Math.min(
                    100,
                    (
                        viewedPixels /
                        documentHeight
                    ) * 100
                );

            if (
                percent >
                maxScrollPercent
            ) {
                maxScrollPercent =
                    percent;
            }
        }
    }

    window.addEventListener(
        "scroll",
        updateScroll,
        {
            passive: true
        }
    );

    /* =====================================================
       TIEMPO ACTIVO / OCULTO
       ===================================================== */

    function countActivitySecond() {
        if (document.hidden) {
            hiddenSeconds++;
            return;
        }

        const idleTime =
            Date.now() -
            lastUserInteraction;

        if (
            idleTime <=
            USER_ACTIVE_TIMEOUT
        ) {
            activeSeconds++;
        }
    }

    /* =====================================================
       MÉTRICAS
       ===================================================== */

    function getCurrentMetrics() {
        updateScroll();

        return {
            duration_seconds:
                Math.max(
                    0,
                    Math.round(
                        (
                            Date.now() -
                            pageStartedAt
                        ) / 1000
                    )
                ),

            active_seconds:
                activeSeconds,

            hidden_seconds:
                hiddenSeconds,

            max_scroll_percent:
                Number(
                    maxScrollPercent
                        .toFixed(2)
                ),

            max_scroll_pixels:
                Math.round(
                    maxScrollPixels
                )
        };
    }

    /* =====================================================
       ACTIVIDAD GENERAL
       ===================================================== */

    async function sendActivity(
        finalUpdate
    ) {
        if (
            !visitorId ||
            !sessionId ||
            !pageviewId
        ) {
            return;
        }

        const metrics =
            getCurrentMetrics();

        try {
            await postJson(
                "/api/activity",
                {
                    visitor_id:
                        visitorId,

                    session_id:
                        sessionId,

                    pageview_id:
                        pageviewId,

                    duration_seconds:
                        metrics.duration_seconds,

                    active_seconds:
                        metrics.active_seconds,

                    hidden_seconds:
                        metrics.hidden_seconds,

                    max_scroll_percent:
                        metrics.max_scroll_percent,

                    max_scroll_pixels:
                        metrics.max_scroll_pixels,

                    final:
                        finalUpdate === true
                }
            );

            updateSessionActivity();
        }
        catch (error) {
            if (!finalUpdate) {
                console.warn(
                    "Aguas Calmas Analytics:",
                    error.message
                );
            }
        }

        /*
        Si es un artículo, enviamos las mismas métricas
        al registro article_reads.
        */

        if (
            articleTrackingEnabled &&
            articleReadId
        ) {
            try {
                await sendArticleActivity(
                    finalUpdate,
                    metrics
                );
            }
            catch (error) {
                if (!finalUpdate) {
                    console.warn(
                        "Aguas Calmas Analytics - artículo:",
                        error.message
                    );
                }
            }
        }
    }

    /* =====================================================
       ACTIVIDAD PERIÓDICA
       ===================================================== */

    function startActivityTracking() {
        updateScroll();

        window.setInterval(
            countActivitySecond,
            1000
        );

        window.setInterval(
            function () {
                sendActivity(false);
            },
            ACTIVITY_INTERVAL
        );
    }

    /* =====================================================
       VISIBILIDAD
       ===================================================== */

    document.addEventListener(
        "visibilitychange",
        function () {
            if (
                document.visibilityState ===
                "hidden"
            ) {
                sendActivity(false);
            }
            else {
                markUserActivity();
            }
        }
    );

    /* =====================================================
       SALIDA
       ===================================================== */

    function sendFinalActivity() {
        if (finalSent) {
            return;
        }

        finalSent = true;

        sendActivity(true);
    }

    window.addEventListener(
        "pagehide",
        sendFinalActivity
    );

    /* =====================================================
       INICIALIZACIÓN
       ===================================================== */

    async function initialize() {
        if (initialized) {
            return;
        }

        initialized = true;

        visitorId =
            getVisitorId();

        sessionId =
            getStoredSession();

        try {
            if (sessionId) {
                await startPageview();
            }
            else {
                await startNewSession();
            }

            pageStartedAt =
                Date.now();

            /*
            Si la página pertenece a /articulos/,
            iniciamos automáticamente article_reads.
            */

            if (
                detectPageType() ===
                "article"
            ) {
                try {
                    await startArticleRead();
                }
                catch (error) {
                    console.warn(
                        "Aguas Calmas Analytics - artículo:",
                        error.message
                    );
                }
            }

            startActivityTracking();
        }
        catch (error) {
            console.warn(
                "Aguas Calmas Analytics:",
                error.message
            );
        }
    }

    /* =====================================================
       INICIAR
       ===================================================== */

    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );
    }
    else {
        initialize();
    }

})();