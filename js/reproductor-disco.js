/* =========================================================
   AGUAS CALMAS
   REPRODUCTOR DE DISCOS

   Funciones:
   - Play / pausa
   - Barra de progreso
   - Una sola canción a la vez
   - Reproducción automática de la siguiente canción
   ========================================================= */


document.addEventListener("DOMContentLoaded", function () {


    const canciones = Array.from(
        document.querySelectorAll(".cancion")
    );


    let audioActivo = null;
    let cancionActiva = null;



    /* =====================================================
       CONVERTIR SEGUNDOS A MM:SS
       ===================================================== */

    function formatearTiempo(segundos) {

        if (!Number.isFinite(segundos)) {
            return "0:00";
        }


        const minutos = Math.floor(segundos / 60);


        const segundosRestantes = Math.floor(segundos % 60)
            .toString()
            .padStart(2, "0");


        return `${minutos}:${segundosRestantes}`;
    }



    /* =====================================================
       ACTUALIZAR BOTÓN
       ===================================================== */

    function actualizarBoton(cancion, reproduciendo) {

        if (!cancion) {
            return;
        }


        const boton =
            cancion.querySelector(".boton-reproducir");


        if (reproduciendo) {

            boton.textContent = "❚❚ Pausa";

            boton.classList.add("reproduciendo");

        } else {

            boton.textContent = "▶ Escuchar";

            boton.classList.remove("reproduciendo");

        }

    }



    /* =====================================================
       DETENER CANCIÓN
       ===================================================== */

    function detenerCancion(cancion) {

        if (!cancion) {
            return;
        }


        const audio =
            cancion.querySelector("audio");


        audio.pause();


        actualizarBoton(
            cancion,
            false
        );


        cancion.classList.remove("activa");
    }



    /* =====================================================
       REPRODUCIR UNA CANCIÓN
       ===================================================== */

    function reproducirCancion(cancion) {

        if (!cancion) {
            return;
        }


        const audio =
            cancion.querySelector("audio");



        /* -----------------------------------------
           DETENER LA CANCIÓN ANTERIOR
           ----------------------------------------- */

        if (
            audioActivo &&
            audioActivo !== audio &&
            cancionActiva
        ) {

            detenerCancion(cancionActiva);

        }



        /* -----------------------------------------
           DEFINIR NUEVA CANCIÓN ACTIVA
           ----------------------------------------- */

        audioActivo = audio;

        cancionActiva = cancion;


        cancion.classList.add("activa");


        actualizarBoton(
            cancion,
            true
        );



        /* -----------------------------------------
           COMENZAR REPRODUCCIÓN
           ----------------------------------------- */

        const promesaReproduccion = audio.play();


        if (promesaReproduccion !== undefined) {

            promesaReproduccion.catch(function () {

                actualizarBoton(
                    cancion,
                    false
                );

            });

        }

    }



    /* =====================================================
       CONFIGURAR CADA CANCIÓN
       ===================================================== */

    canciones.forEach(function (cancion, indice) {


        const audio =
            cancion.querySelector("audio");


        const boton =
            cancion.querySelector(".boton-reproducir");


        const barra =
            cancion.querySelector(".barra-progreso");


        const tiempoActual =
            cancion.querySelector(".tiempo-actual");


        const tiempoTotal =
            cancion.querySelector(".tiempo-total");



        /* -------------------------------------------------
           BLOQUEO BÁSICO DEL MENÚ CONTEXTUAL
           ------------------------------------------------- */

        cancion.addEventListener(
            "contextmenu",
            function (evento) {

                evento.preventDefault();

            }
        );



        /* -------------------------------------------------
           BOTÓN PLAY / PAUSA
           ------------------------------------------------- */

        boton.addEventListener(
            "click",
            function () {


                /*
                   Si está pausado:
                   reproducimos la canción.
                */

                if (audio.paused) {

                    reproducirCancion(cancion);

                }


                /*
                   Si está sonando:
                   la pausamos.
                */

                else {

                    audio.pause();


                    actualizarBoton(
                        cancion,
                        false
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


                barra.max = audio.duration;


                tiempoTotal.textContent =
                    formatearTiempo(audio.duration);

            }
        );



        /* -------------------------------------------------
           ACTUALIZAR BARRA DE PROGRESO
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

            }
        );



        /* -------------------------------------------------
           CAMBIAR POSICIÓN MANUALMENTE
           ------------------------------------------------- */

        barra.addEventListener(
            "input",
            function () {


                audio.currentTime =
                    Number(barra.value);

            }
        );



        /* -------------------------------------------------
           CUANDO TERMINA UNA CANCIÓN
           ------------------------------------------------- */

        audio.addEventListener(
            "ended",
            function () {


                /*
                   Reiniciamos visualmente
                   la canción que terminó.
                */

                audio.currentTime = 0;

                barra.value = 0;

                tiempoActual.textContent = "0:00";


                actualizarBoton(
                    cancion,
                    false
                );


                cancion.classList.remove("activa");



                /* -----------------------------------------
                   BUSCAR LA SIGUIENTE CANCIÓN
                   ----------------------------------------- */

                const siguienteCancion =
                    canciones[indice + 1];



                /*
                   Si existe una canción siguiente,
                   comienza automáticamente.
                */

                if (siguienteCancion) {

                    reproducirCancion(
                        siguienteCancion
                    );

                }


                /*
                   Si era la última canción,
                   finaliza la reproducción.
                */

                else {

                    audioActivo = null;

                    cancionActiva = null;

                }

            }
        );


    });


});