/* =========================================================
   AGUAS CALMAS
   REPRODUCTOR DE DISCOS + ANALÍTICA

   Funciones:
   - Play / pausa
   - Barra de progreso
   - Una sola canción a la vez
   - Reproducción automática de la siguiente canción

   Analítica:
   - Inicio de reproducción
   - Reanudación
   - Pausas
   - Búsquedas manuales
   - Tiempo realmente escuchado
   - Posición máxima
   - Porcentaje reproducido
   - Reproducción calificada
   - Canción completada
   ========================================================= */


document.addEventListener(
    "DOMContentLoaded",
    function () {

        "use strict";


        /* =====================================================
           CONFIGURACIÓN DE ANALÍTICA
           ===================================================== */

        const API_BASE =
            "https://aguas-calmas-analytics.aguas-calmas.workers.dev";


        const VISITOR_KEY =
            "aguas_calmas_visitor_id";


        const SESSION_KEY =
            "aguas_calmas_session_id";


        const ANALYTICS_INTERVAL =
            15000;



        /* =====================================================
           CANCIONES
           ===================================================== */

        const canciones =
            Array.from(
                document.querySelectorAll(
                    ".cancion"
                )
            );


        let audioActivo =
            null;


        let cancionActiva =
            null;



        /*
           Cada canción mantiene su propio estado
           de reproducción analítica.
        */

        const estadosAnalytics =
            new WeakMap();



        /* =====================================================
           ESTADO ANALÍTICO DE UNA CANCIÓN
           ===================================================== */

        function obtenerEstado(
            cancion
        ) {

            let estado =
                estadosAnalytics.get(
                    cancion
                );


            if (!estado) {

                estado = {

                    playId:
                        null,

                    trackId:
                        null,

                    albumId:
                        null,

                    starting:
                        false,

                    listenedSeconds:
                        0,

                    maxPositionSeconds:
                        0,

                    lastListenTick:
                        null,

                    pendingOrigin:
                        "manual"

                };


                estadosAnalytics.set(
                    cancion,
                    estado
                );

            }


            return estado;

        }



        /* =====================================================
           PETICIÓN JSON
           ===================================================== */

        async function postJson(
            endpoint,
            data
        ) {

            const response =
                await fetch(

                    API_BASE +
                    endpoint,

                    {

                        method:
                            "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify(
                                data
                            ),

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
           DATOS DE SESIÓN DEL TRACKER
           ===================================================== */

        function obtenerSesionAnalytics() {

            let visitorId =
                null;


            let sessionId =
                null;


            try {

                visitorId =
                    localStorage.getItem(
                        VISITOR_KEY
                    );

            }
            catch (error) {

                visitorId =
                    null;

            }


            try {

                sessionId =
                    sessionStorage.getItem(
                        SESSION_KEY
                    );

            }
            catch (error) {

                sessionId =
                    null;

            }


            if (
                !visitorId ||
                !sessionId
            ) {

                return null;

            }


            return {

                visitor_id:
                    visitorId,

                session_id:
                    sessionId

            };

        }



        /*
           Si el usuario pulsa Play justo cuando
           la página acaba de abrirse, puede ocurrir
           que tracker.js todavía esté creando la sesión.

           Esperamos brevemente antes de abandonar
           el registro de analítica.
        */

        async function esperarSesionAnalytics() {

            for (
                let intento = 0;
                intento < 10;
                intento++
            ) {

                const sesion =
                    obtenerSesionAnalytics();


                if (sesion) {

                    return sesion;

                }


                await new Promise(
                    function (resolve) {

                        window.setTimeout(
                            resolve,
                            200
                        );

                    }
                );

            }


            return null;

        }



        /* =====================================================
           UTILIDADES DE TEXTO
           ===================================================== */

        function limpiarTexto(
            valor
        ) {

            if (
                valor === null ||
                valor === undefined
            ) {

                return "";

            }


            return String(
                valor
            ).trim();

        }



        function crearSlugDesdeTexto(
            texto
        ) {

            let valor =
                limpiarTexto(
                    texto
                )
                    .toLowerCase();


            if (!valor) {

                return "";

            }


            try {

                valor =
                    valor.normalize(
                        "NFD"
                    )
                    .replace(
                        /[\u0300-\u036f]/g,
                        ""
                    );

            }
            catch (error) {

                /*
                   Algunos navegadores antiguos
                   pueden no soportar normalize().
                */

            }


            return valor

                .replace(
                    /[^a-z0-9]+/g,
                    "-"
                )

                .replace(
                    /^-+|-+$/g,
                    "");

        }



        /* =====================================================
           DATOS DEL ÁLBUM
           ===================================================== */

        function obtenerAlbumSlug() {

            if (
                document.body &&
                document.body.dataset &&
                document.body.dataset.albumSlug
            ) {

                return limpiarTexto(
                    document.body.dataset.albumSlug
                );

            }


            const path =
                window.location.pathname;


            let archivo =
                path
                    .split("/")
                    .pop();


            if (
                archivo
            ) {

                archivo =
                    archivo.replace(
                        /\.html?$/i,
                        ""
                    );

            }


            if (
                archivo &&
                archivo.toLowerCase() !==
                    "index"
            ) {

                try {

                    return decodeURIComponent(
                        archivo
                    );

                }
                catch (error) {

                    return archivo;

                }

            }


            return crearSlugDesdeTexto(
                obtenerAlbumTitulo()
            ) ||
            "disco";

        }



        function obtenerAlbumTitulo() {

            if (
                document.body &&
                document.body.dataset &&
                document.body.dataset.albumTitle
            ) {

                const valor =
                    limpiarTexto(
                        document.body.dataset.albumTitle
                    );


                if (valor) {

                    return valor;

                }

            }


            const selectores = [

                ".titulo-disco",

                ".album-titulo",

                ".titulo-album",

                "[data-album-title]",

                "h1"

            ];


            for (
                let i = 0;
                i < selectores.length;
                i++
            ) {

                const elemento =
                    document.querySelector(
                        selectores[i]
                    );


                if (
                    elemento
                ) {

                    const texto =
                        limpiarTexto(
                            elemento.textContent
                        );


                    if (texto) {

                        return texto;

                    }

                }

            }


            if (
                document.title
            ) {

                return document.title
                    .replace(
                        /\s*\|\s*Aguas Calmas\s*$/i,
                        ""
                    )
                    .trim();

            }


            return obtenerAlbumSlug();

        }



        function obtenerReleaseYear() {

            if (
                document.body &&
                document.body.dataset &&
                document.body.dataset.releaseYear
            ) {

                const year =
                    Number(
                        document.body.dataset.releaseYear
                    );


                if (
                    Number.isFinite(year)
                ) {

                    return year;

                }

            }


            return null;

        }



        /* =====================================================
           FUENTE DEL AUDIO
           ===================================================== */

        function obtenerFuenteAudio(
            audio
        ) {

            if (
                audio.currentSrc
            ) {

                return audio.currentSrc;

            }


            const srcDirecto =
                audio.getAttribute(
                    "src"
                );


            if (
                srcDirecto
            ) {

                return srcDirecto;

            }


            const source =
                audio.querySelector(
                    "source"
                );


            if (
                source
            ) {

                return (
                    source.getAttribute(
                        "src"
                    ) ||
                    ""
                );

            }


            return "";

        }



        /* =====================================================
           DATOS DE LA CANCIÓN
           ===================================================== */

        function obtenerTrackSlug(
            cancion,
            audio,
            indice
        ) {

            if (
                cancion.dataset &&
                cancion.dataset.trackSlug
            ) {

                return limpiarTexto(
                    cancion.dataset.trackSlug
                );

            }


            if (
                audio.dataset &&
                audio.dataset.trackSlug
            ) {

                return limpiarTexto(
                    audio.dataset.trackSlug
                );

            }


            const fuente =
                obtenerFuenteAudio(
                    audio
                );


            if (
                fuente
            ) {

                let archivo =
                    fuente
                        .split("/")
                        .pop();


                archivo =
                    archivo
                        .split("?")[0]
                        .split("#")[0];


                try {

                    archivo =
                        decodeURIComponent(
                            archivo
                        );

                }
                catch (error) {

                    /*
                       Se conserva el nombre
                       original si falla.
                    */

                }


                archivo =
                    archivo.replace(
                        /\.[a-z0-9]+$/i,
                        ""
                    );


                if (
                    archivo
                ) {

                    return archivo;

                }

            }


            return (
                "track-" +
                String(
                    indice + 1
                )
            );

        }



        function obtenerTrackTitulo(
            cancion,
            audio,
            indice
        ) {

            if (
                cancion.dataset &&
                cancion.dataset.trackTitle
            ) {

                const valor =
                    limpiarTexto(
                        cancion.dataset.trackTitle
                    );


                if (
                    valor
                ) {

                    return valor;

                }

            }


            if (
                audio.dataset &&
                audio.dataset.trackTitle
            ) {

                const valor =
                    limpiarTexto(
                        audio.dataset.trackTitle
                    );


                if (
                    valor
                ) {

                    return valor;

                }

            }


            const selectores = [

                ".titulo-cancion",

                ".nombre-cancion",

                ".cancion-titulo",

                ".track-title",

                "[data-track-title]",

                "h2",

                "h3",

                "h4"

            ];


            for (
                let i = 0;
                i < selectores.length;
                i++
            ) {

                const elemento =
                    cancion.querySelector(
                        selectores[i]
                    );


                if (
                    elemento
                ) {

                    const texto =
                        limpiarTexto(
                            elemento.textContent
                        );


                    if (
                        texto
                    ) {

                        return texto;

                    }

                }

            }


            const slug =
                obtenerTrackSlug(
                    cancion,
                    audio,
                    indice
                );


            if (
                slug
            ) {

                return slug
                    .replace(
                        /[-_]+/g,
                        " "
                    )
                    .trim();

            }


            return (
                "Canción " +
                String(
                    indice + 1
                )
            );

        }



        function obtenerTrackNumber(
            cancion,
            audio,
            indice
        ) {

            let valor =
                null;


            if (
                cancion.dataset &&
                cancion.dataset.trackNumber
            ) {

                valor =
                    Number(
                        cancion.dataset.trackNumber
                    );

            }


            if (
                !Number.isFinite(valor) &&
                audio.dataset &&
                audio.dataset.trackNumber
            ) {

                valor =
                    Number(
                        audio.dataset.trackNumber
                    );

            }


            if (
                Number.isFinite(valor)
            ) {

                return valor;

            }


            return indice + 1;

        }



        /* =====================================================
           CONVERTIR SEGUNDOS A MM:SS
           ===================================================== */

        function formatearTiempo(
            segundos
        ) {

            if (
                !Number.isFinite(
                    segundos
                )
            ) {

                return "0:00";

            }


            const minutos =
                Math.floor(
                    segundos / 60
                );


            const segundosRestantes =
                Math.floor(
                    segundos % 60
                )
                    .toString()
                    .padStart(
                        2,
                        "0"
                    );


            return (
                minutos +
                ":" +
                segundosRestantes
            );

        }



        /* =====================================================
           ACTUALIZAR BOTÓN
           ===================================================== */

        function actualizarBoton(
            cancion,
            reproduciendo
        ) {

            if (!cancion) {

                return;

            }


            const boton =
                cancion.querySelector(
                    ".boton-reproducir"
                );


            if (!boton) {

                return;

            }


            if (
                reproduciendo
            ) {

                boton.textContent =
                    "❚❚ Pausa";


                boton.classList.add(
                    "reproduciendo"
                );

            }
            else {

                boton.textContent =
                    "▶ Escuchar";


                boton.classList.remove(
                    "reproduciendo"
                );

            }

        }



        /* =====================================================
           TIEMPO REALMENTE ESCUCHADO
           ===================================================== */

        function comenzarConteoEscucha(
            cancion
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            estado.lastListenTick =
                performance.now();

        }



        function detenerConteoEscucha(
            cancion
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            estado.lastListenTick =
                null;

        }



        function acumularEscucha(
            cancion,
            forzar
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                estado.lastListenTick ===
                null
            ) {

                return;

            }


            const audio =
                cancion.querySelector(
                    "audio"
                );


            const ahora =
                performance.now();


            /*
               Se acumula mientras el audio estaba
               reproduciéndose.

               "forzar" se utiliza justo antes de
               una pausa, stop o ended.
            */

            if (
                forzar === true ||
                (
                    audio &&
                    !audio.paused &&
                    !audio.ended
                )
            ) {

                const delta =
                    (
                        ahora -
                        estado.lastListenTick
                    ) / 1000;


                if (
                    Number.isFinite(delta) &&
                    delta > 0
                ) {

                    estado.listenedSeconds +=
                        delta;

                }

            }


            estado.lastListenTick =
                ahora;


            if (
                audio &&
                Number.isFinite(
                    audio.currentTime
                )
            ) {

                estado.maxPositionSeconds =
                    Math.max(

                        estado.maxPositionSeconds,

                        audio.currentTime

                    );

            }

        }



        /* =====================================================
           INICIAR REGISTRO DE REPRODUCCIÓN
           ===================================================== */

        async function iniciarRegistroReproduccion(
            cancion,
            indice
        ) {

            const audio =
                cancion.querySelector(
                    "audio"
                );


            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                estado.playId ||
                estado.starting
            ) {

                return;

            }


            estado.starting =
                true;


            try {

                const sesion =
                    await esperarSesionAnalytics();


                if (
                    !sesion
                ) {

                    throw new Error(
                        "No existe una sesión de analítica disponible"
                    );

                }


                const duracion =
                    Number.isFinite(
                        audio.duration
                    )

                        ? audio.duration

                        : 0;


                const posicion =
                    Number.isFinite(
                        audio.currentTime
                    )

                        ? audio.currentTime

                        : 0;


                const resultado =
                    await postJson(

                        "/api/audio/start",

                        {

                            visitor_id:
                                sesion.visitor_id,

                            session_id:
                                sesion.session_id,


                            album_slug:
                                obtenerAlbumSlug(),

                            album_title:
                                obtenerAlbumTitulo(),

                            release_year:
                                obtenerReleaseYear(),


                            track_slug:
                                obtenerTrackSlug(
                                    cancion,
                                    audio,
                                    indice
                                ),

                            track_title:
                                obtenerTrackTitulo(
                                    cancion,
                                    audio,
                                    indice
                                ),

                            track_number:
                                obtenerTrackNumber(
                                    cancion,
                                    audio,
                                    indice
                                ),

                            duration_seconds:
                                duracion,


                            position_seconds:
                                posicion,


                            source_path:
                                window.location.pathname,


                            metadata: {

                                origin:
                                    estado.pendingOrigin,

                                audio_source:
                                    obtenerFuenteAudio(
                                        audio
                                    )

                            }

                        }

                    );


                if (
                    !resultado ||
                    !resultado.ok ||
                    !resultado.play_id
                ) {

                    throw new Error(
                        "No fue posible iniciar el registro de reproducción"
                    );

                }


                estado.playId =
                    resultado.play_id;


                estado.trackId =
                    resultado.track_id ||
                    null;


                estado.albumId =
                    resultado.album_id ||
                    null;


                estado.listenedSeconds =
                    0;


                estado.maxPositionSeconds =
                    posicion;


                comenzarConteoEscucha(
                    cancion
                );


                /*
                   Si el usuario pausó antes de que
                   terminara la petición inicial,
                   registramos inmediatamente la pausa.
                */

                if (
                    audio.paused &&
                    !audio.ended
                ) {

                    await enviarActividadAudio(

                        cancion,

                        "pause",

                        false,

                        false

                    );

                }

            }
            catch (error) {

                console.warn(

                    "Aguas Calmas Analytics - audio:",

                    error.message

                );

            }
            finally {

                estado.starting =
                    false;

            }

        }



        /* =====================================================
           ENVIAR ACTIVIDAD DE AUDIO
           ===================================================== */

        async function enviarActividadAudio(
            cancion,
            eventType,
            finalUpdate,
            completed
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                !estado.playId
            ) {

                return;

            }


            const sesion =
                obtenerSesionAnalytics();


            if (
                !sesion
            ) {

                return;

            }


            const audio =
                cancion.querySelector(
                    "audio"
                );


            if (
                !audio
            ) {

                return;

            }


            const playId =
                estado.playId;


            const posicion =
                Number.isFinite(
                    audio.currentTime
                )

                    ? audio.currentTime

                    : 0;


            estado.maxPositionSeconds =
                Math.max(

                    estado.maxPositionSeconds,

                    posicion

                );


            const duracion =
                Number.isFinite(
                    audio.duration
                )

                    ? audio.duration

                    : 0;


            try {

                await postJson(

                    "/api/audio/activity",

                    {

                        play_id:
                            playId,

                        visitor_id:
                            sesion.visitor_id,

                        session_id:
                            sesion.session_id,


                        listened_seconds:
                            Number(
                                estado.listenedSeconds
                                    .toFixed(2)
                            ),


                        position_seconds:
                            posicion,


                        max_position_seconds:
                            estado.maxPositionSeconds,


                        duration_seconds:
                            duracion,


                        event_type:
                            eventType ||
                            null,


                        completed:
                            completed === true,


                        final:
                            finalUpdate === true,


                        metadata:
                            eventType

                                ? {

                                    page:
                                        window.location.pathname

                                }

                                : undefined

                    }

                );

            }
            catch (error) {

                if (
                    finalUpdate !== true
                ) {

                    console.warn(

                        "Aguas Calmas Analytics - audio:",

                        error.message

                    );

                }

            }

        }



        /* =====================================================
           REGISTRAR REANUDACIÓN
           ===================================================== */

        async function registrarReanudacion(
            cancion
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                !estado.playId
            ) {

                return;

            }


            comenzarConteoEscucha(
                cancion
            );


            await enviarActividadAudio(

                cancion,

                "resume",

                false,

                false

            );

        }



        /* =====================================================
           REGISTRAR PAUSA
           ===================================================== */

        function registrarPausa(
            cancion
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                !estado.playId
            ) {

                return;

            }


            acumularEscucha(
                cancion,
                true
            );


            detenerConteoEscucha(
                cancion
            );


            enviarActividadAudio(

                cancion,

                "pause",

                false,

                false

            );

        }



        /* =====================================================
           REGISTRAR SEEK
           ===================================================== */

        function registrarSeek(
            cancion
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                !estado.playId
            ) {

                return;

            }


            acumularEscucha(
                cancion,
                false
            );


            enviarActividadAudio(

                cancion,

                "seek",

                false,

                false

            );

        }



        /* =====================================================
           FINALIZAR UNA REPRODUCCIÓN ANALÍTICA
           ===================================================== */

        function finalizarRegistro(
            cancion,
            tipoEvento,
            completada
        ) {

            const estado =
                obtenerEstado(
                    cancion
                );


            if (
                !estado.playId
            ) {

                return;

            }


            /*
               Capturamos el último fragmento
               realmente escuchado.
            */

            acumularEscucha(
                cancion,
                true
            );


            detenerConteoEscucha(
                cancion
            );


            /*
               La petición utiliza los valores actuales
               antes de reiniciar el estado.
            */

            enviarActividadAudio(

                cancion,

                tipoEvento,

                true,

                completada === true

            );


            estado.playId =
                null;


            estado.trackId =
                null;


            estado.albumId =
                null;


            estado.listenedSeconds =
                0;


            estado.maxPositionSeconds =
                0;


            estado.lastListenTick =
                null;

        }



        /* =====================================================
           DETENER CANCIÓN
           ===================================================== */

        function detenerCancion(
            cancion
        ) {

            if (
                !cancion
            ) {

                return;

            }


            const audio =
                cancion.querySelector(
                    "audio"
                );


            /*
               Si estaba siendo registrada como
               reproducción, cerramos ese play.
            */

            finalizarRegistro(

                cancion,

                "stop",

                false

            );


            audio.pause();


            actualizarBoton(

                cancion,

                false

            );


            cancion.classList.remove(
                "activa"
            );

        }



        /* =====================================================
           REPRODUCIR UNA CANCIÓN
           ===================================================== */

        function reproducirCancion(
            cancion,
            origen
        ) {

            if (
                !cancion
            ) {

                return;

            }


            const audio =
                cancion.querySelector(
                    "audio"
                );


            const estado =
                obtenerEstado(
                    cancion
                );


            estado.pendingOrigin =
                origen ||
                "manual";



            /* -----------------------------------------
               DETENER CANCIÓN ANTERIOR
               ----------------------------------------- */

            if (
                audioActivo &&
                audioActivo !== audio &&
                cancionActiva
            ) {

                detenerCancion(
                    cancionActiva
                );

            }



            /* -----------------------------------------
               DEFINIR NUEVA CANCIÓN ACTIVA
               ----------------------------------------- */

            audioActivo =
                audio;


            cancionActiva =
                cancion;


            cancion.classList.add(
                "activa"
            );


            actualizarBoton(

                cancion,

                true

            );



            /* -----------------------------------------
               COMENZAR REPRODUCCIÓN
               ----------------------------------------- */

            const promesaReproduccion =
                audio.play();


            if (
                promesaReproduccion !==
                undefined
            ) {

                promesaReproduccion
                    .catch(
                        function () {

                            actualizarBoton(

                                cancion,

                                false

                            );

                        }
                    );

            }

        }



        /* =====================================================
           CONFIGURAR CADA CANCIÓN
           ===================================================== */

        canciones.forEach(
            function (
                cancion,
                indice
            ) {


                const audio =
                    cancion.querySelector(
                        "audio"
                    );


                const boton =
                    cancion.querySelector(
                        ".boton-reproducir"
                    );


                const barra =
                    cancion.querySelector(
                        ".barra-progreso"
                    );


                const tiempoActual =
                    cancion.querySelector(
                        ".tiempo-actual"
                    );


                const tiempoTotal =
                    cancion.querySelector(
                        ".tiempo-total"
                    );


                /*
                   Creamos el estado analítico
                   desde el inicio.
                */

                obtenerEstado(
                    cancion
                );



                /* -------------------------------------------------
                   BLOQUEO BÁSICO DEL MENÚ CONTEXTUAL
                   ------------------------------------------------- */

                cancion.addEventListener(

                    "contextmenu",

                    function (
                        evento
                    ) {

                        evento.preventDefault();

                    }

                );



                /* -------------------------------------------------
                   BOTÓN PLAY / PAUSA
                   ------------------------------------------------- */

                boton.addEventListener(

                    "click",

                    function () {


                        if (
                            audio.paused
                        ) {

                            reproducirCancion(

                                cancion,

                                "manual"

                            );

                        }


                        else {

                            registrarPausa(
                                cancion
                            );


                            audio.pause();


                            actualizarBoton(

                                cancion,

                                false

                            );

                        }

                    }

                );



                /* -------------------------------------------------
                   EVENTO REAL PLAY
                   ------------------------------------------------- */

                audio.addEventListener(

                    "play",

                    function () {

                        const estado =
                            obtenerEstado(
                                cancion
                            );


                        /*
                           Si todavía no existe play_id,
                           comienza una reproducción nueva.
                        */

                        if (
                            !estado.playId
                        ) {

                            iniciarRegistroReproduccion(

                                cancion,

                                indice

                            );

                        }


                        /*
                           Si ya existía play_id,
                           significa que se reanudó
                           una reproducción pausada.
                        */

                        else {

                            registrarReanudacion(
                                cancion
                            );

                        }

                    }

                );



                /* -------------------------------------------------
                   CARGAR DURACIÓN
                   ------------------------------------------------- */

                audio.addEventListener(

                    "loadedmetadata",

                    function () {

                        barra.max =
                            audio.duration;


                        tiempoTotal.textContent =
                            formatearTiempo(
                                audio.duration
                            );

                    }

                );



                /* -------------------------------------------------
                   ACTUALIZAR BARRA
                   ------------------------------------------------- */

                audio.addEventListener(

                    "timeupdate",

                    function () {

                        barra.value =
                            audio.currentTime;


                        tiempoActual.textContent =
                            formatearTiempo(
                                audio.currentTime
                            );


                        const estado =
                            obtenerEstado(
                                cancion
                            );


                        estado.maxPositionSeconds =
                            Math.max(

                                estado.maxPositionSeconds,

                                Number.isFinite(
                                    audio.currentTime
                                )

                                    ? audio.currentTime

                                    : 0

                            );

                    }

                );



                /* -------------------------------------------------
                   CAMBIAR POSICIÓN MANUALMENTE
                   ------------------------------------------------- */

                barra.addEventListener(

                    "input",

                    function () {

                        audio.currentTime =
                            Number(
                                barra.value
                            );

                    }

                );



                /*
                   "change" ocurre cuando el usuario
                   termina de mover la barra.

                   Así evitamos registrar decenas de
                   eventos seek durante un solo arrastre.
                */

                barra.addEventListener(

                    "change",

                    function () {

                        registrarSeek(
                            cancion
                        );

                    }

                );



                /* -------------------------------------------------
                   CUANDO TERMINA UNA CANCIÓN
                   ------------------------------------------------- */

                audio.addEventListener(

                    "ended",

                    function () {


                        /*
                           Primero registramos la finalización
                           con la posición final real.
                        */

                        finalizarRegistro(

                            cancion,

                            "ended",

                            true

                        );



                        /*
                           Reiniciamos visualmente
                           la canción terminada.
                        */

                        audio.currentTime =
                            0;


                        barra.value =
                            0;


                        tiempoActual.textContent =
                            "0:00";


                        actualizarBoton(

                            cancion,

                            false

                        );


                        cancion.classList.remove(
                            "activa"
                        );



                        /* -----------------------------------------
                           SIGUIENTE CANCIÓN
                           ----------------------------------------- */

                        const siguienteCancion =
                            canciones[
                                indice + 1
                            ];


                        if (
                            siguienteCancion
                        ) {

                            reproducirCancion(

                                siguienteCancion,

                                "auto_next"

                            );

                        }


                        else {

                            audioActivo =
                                null;


                            cancionActiva =
                                null;

                        }

                    }

                );


            }

        );



        /* =====================================================
           CONTADOR DE TIEMPO ESCUCHADO
           ===================================================== */

        window.setInterval(

            function () {

                if (
                    !cancionActiva ||
                    !audioActivo
                ) {

                    return;

                }


                if (
                    audioActivo.paused ||
                    audioActivo.ended
                ) {

                    return;

                }


                const estado =
                    obtenerEstado(
                        cancionActiva
                    );


                if (
                    !estado.playId
                ) {

                    return;

                }


                acumularEscucha(

                    cancionActiva,

                    false

                );

            },

            1000

        );



        /* =====================================================
           ENVÍO PERIÓDICO
           ===================================================== */

        window.setInterval(

            function () {

                if (
                    !cancionActiva ||
                    !audioActivo
                ) {

                    return;

                }


                const estado =
                    obtenerEstado(
                        cancionActiva
                    );


                if (
                    !estado.playId
                ) {

                    return;

                }


                /*
                   Actualizamos el tiempo antes
                   de enviar las métricas.
                */

                if (
                    !audioActivo.paused &&
                    !audioActivo.ended
                ) {

                    acumularEscucha(

                        cancionActiva,

                        false

                    );

                }


                /*
                   Sin event_type:
                   actualiza track_plays pero no crea
                   un audio_event innecesario.
                */

                enviarActividadAudio(

                    cancionActiva,

                    null,

                    false,

                    false

                );

            },

            ANALYTICS_INTERVAL

        );



        /* =====================================================
           SALIDA DE LA PÁGINA
           ===================================================== */

        let salidaEnviada =
            false;


        function cerrarReproduccionAlSalir() {

            if (
                salidaEnviada
            ) {

                return;

            }


            salidaEnviada =
                true;


            if (
                cancionActiva
            ) {

                const estado =
                    obtenerEstado(
                        cancionActiva
                    );


                if (
                    estado.playId
                ) {

                    finalizarRegistro(

                        cancionActiva,

                        "page_exit",

                        false

                    );

                }

            }

        }



        window.addEventListener(

            "pagehide",

            cerrarReproduccionAlSalir

        );


    }
);