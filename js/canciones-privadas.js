(() => {
"use strict";

const VAULT_BASE="vault/";
const CONFIG_URL=`${VAULT_BASE}config.json`;
const MANIFEST_URL=`${VAULT_BASE}manifest.enc`;
const AAD_MASTER="AguasCalmasVaultMasterKey-v1";
const AAD_MANIFEST="manifest-v1";
const encoder=new TextEncoder();
const decoder=new TextDecoder();

const panelAcceso=document.getElementById("panel-acceso");
const panelArchivo=document.getElementById("panel-archivo");
const formularioAcceso=document.getElementById("formulario-acceso");
const claveAcceso=document.getElementById("clave-acceso");
const botonEntrar=document.getElementById("boton-entrar");
const estadoAcceso=document.getElementById("estado-acceso");
const archivoProyectos=document.getElementById("archivo-proyectos");
const tituloArchivo=document.getElementById("titulo-archivo");
const botonCerrar=document.getElementById("boton-cerrar");

let masterKey=null;
let pistaActual=-1;
const pistas=[];

function setEstado(mensaje,esError=false){
    estadoAcceso.textContent=mensaje;
    estadoAcceso.classList.toggle("error",esError);
}

function base64ToBytes(base64){
    const binario=atob(base64);
    const bytes=new Uint8Array(binario.length);
    for(let i=0;i<binario.length;i+=1){bytes[i]=binario.charCodeAt(i);}
    return bytes;
}

async function derivarClaveContrasena(password,kdf){
    const material=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);
    return crypto.subtle.deriveKey(
        {name:"PBKDF2",hash:kdf.hash,salt:base64ToBytes(kdf.salt),iterations:kdf.iterations},
        material,
        {name:"AES-GCM",length:256},
        false,
        ["encrypt","decrypt"]
    );
}

async function descifrarClaveMaestra(password,config){
    const kek=await derivarClaveContrasena(password,config.kdf);
    const rawMasterKey=await crypto.subtle.decrypt(
        {name:"AES-GCM",iv:base64ToBytes(config.keyWrap.iv),additionalData:encoder.encode(AAD_MASTER),tagLength:128},
        kek,
        base64ToBytes(config.keyWrap.ciphertext)
    );
    return crypto.subtle.importKey("raw",rawMasterKey,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}

async function fetchJson(url){
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`No se pudo cargar ${url}`);
    return r.json();
}

async function fetchBytes(url){
    const r=await fetch(url,{cache:"no-store"});
    if(!r.ok)throw new Error(`No se pudo cargar ${url}`);
    return new Uint8Array(await r.arrayBuffer());
}

async function descifrarEnvelope(bytes,key,aadTexto){
    if(bytes.byteLength<=12)throw new Error("Archivo cifrado inválido.");
    const iv=bytes.slice(0,12);
    const ciphertext=bytes.slice(12);
    return crypto.subtle.decrypt(
        {name:"AES-GCM",iv,additionalData:encoder.encode(aadTexto),tagLength:128},
        key,
        ciphertext
    );
}

async function cargarManifest(key){
    const envelope=await fetchBytes(MANIFEST_URL);
    const plano=await descifrarEnvelope(envelope,key,AAD_MANIFEST);
    const manifest=JSON.parse(decoder.decode(plano));
    if(manifest.version!==1||!Array.isArray(manifest.projects))throw new Error("Manifest incompatible.");
    return manifest;
}

function crearElemento(tag,clase,texto=""){
    const e=document.createElement(tag);
    if(clase)e.className=clase;
    if(texto)e.textContent=texto;
    return e;
}

function formatearTiempo(segundos){
    if(!Number.isFinite(segundos)||segundos<0)return "0:00";
    const m=Math.floor(segundos/60);
    const s=Math.floor(segundos%60);
    return `${m}:${String(s).padStart(2,"0")}`;
}

function liberarAudio(pista){
    if(!pista)return;
    if(pista.audio){
        pista.audio.pause();
        pista.audio.src="";
        pista.audio.load();
        pista.audio=null;
    }
    if(pista.objectUrl){
        URL.revokeObjectURL(pista.objectUrl);
        pista.objectUrl=null;
    }
    pista.cargando=false;
    pista.boton.disabled=false;
    pista.boton.textContent="▶";
    pista.progreso.value=0;
    pista.tiempo.textContent="0:00 / 0:00";
}

function limpiarPistas(){
    for(const pista of pistas)liberarAudio(pista);
    pistas.length=0;
    pistaActual=-1;
}

function detenerOtrasPistas(indiceConservar){
    pistas.forEach((pista,indice)=>{
        if(indice!==indiceConservar&&pista.audio)liberarAudio(pista);
    });
}

async function prepararAudio(indice){
    const pista=pistas[indice];
    if(!pista)throw new Error("Pista inexistente.");
    if(pista.audio)return pista.audio;
    if(pista.cargando)return null;

    pista.cargando=true;
    pista.boton.disabled=true;
    pista.boton.textContent="…";
    pista.estado.textContent="Descargando y descifrando el audio…";

    const archivo=String(pista.data.file||"");
    if(!/^[A-Za-z0-9._-]+\.enc$/.test(archivo))throw new Error("Archivo inválido.");

    try{
        const envelope=await fetchBytes(`${VAULT_BASE}${archivo}`);
        const audioPlano=await descifrarEnvelope(envelope,masterKey,`track:${archivo}`);
        const blob=new Blob([audioPlano],{type:pista.data.mime||"audio/mpeg"});
        const objectUrl=URL.createObjectURL(blob);
        const audio=new Audio();

        audio.preload="metadata";
        audio.src=objectUrl;
        audio.controls=false;

        pista.audio=audio;
        pista.objectUrl=objectUrl;
        pista.cargando=false;
        pista.boton.disabled=false;
        pista.boton.textContent="▶";
        pista.estado.textContent="Audio listo para reproducir.";

        audio.addEventListener("loadedmetadata",()=>{
            pista.tiempo.textContent=`0:00 / ${formatearTiempo(audio.duration)}`;
        });

        audio.addEventListener("timeupdate",()=>{
            if(Number.isFinite(audio.duration)&&audio.duration>0){
                pista.progreso.value=(audio.currentTime/audio.duration)*100;
            }
            pista.tiempo.textContent=`${formatearTiempo(audio.currentTime)} / ${formatearTiempo(audio.duration)}`;
        });

        audio.addEventListener("play",()=>{
            pista.boton.textContent="❚❚";
            pista.estado.textContent="Reproduciendo.";
        });

        audio.addEventListener("pause",()=>{
            if(!audio.ended)pista.boton.textContent="▶";
        });

        audio.addEventListener("ended",async()=>{
            pista.boton.textContent="▶";
            pista.progreso.value=0;
            pista.estado.textContent="Reproducción finalizada.";

            const siguiente=indice+1;
            if(siguiente<pistas.length){
                try{
                    await reproducirPista(siguiente,true);
                }catch(error){
                    console.error(error);
                    if(pistas[siguiente]){
                        pistas[siguiente].estado.textContent="La siguiente canción está lista. Pulsa Play.";
                    }
                }
            }else{
                pistaActual=-1;
            }
        });

        return audio;
    }catch(error){
        pista.cargando=false;
        pista.boton.disabled=false;
        pista.boton.textContent="▶";
        pista.estado.textContent="No fue posible cargar o descifrar esta canción.";
        throw error;
    }
}

async function reproducirPista(indice,desdeSecuencia=false){
    if(!masterKey){bloquear();return;}
    const pista=pistas[indice];
    if(!pista)return;

    if(pistaActual===indice&&pista.audio){
        if(pista.audio.paused)await pista.audio.play();
        else pista.audio.pause();
        return;
    }

    detenerOtrasPistas(indice);
    pistaActual=indice;

    const audio=await prepararAudio(indice);
    if(!audio)return;

    try{
        await audio.play();
    }catch(error){
        console.error(error);
        pista.boton.textContent="▶";
        pista.estado.textContent=desdeSecuencia
            ?"La siguiente canción está lista. Pulsa Play para continuar."
            :"Pulsa Play para iniciar.";
    }
}

function crearPista(pistaData){
    const indice=pistas.length;
    const contenedor=crearElemento("article","pista");
    const titulo=crearElemento("p","pista-titulo",pistaData.title||"Pista");
    const reproductor=crearElemento("div","reproductor-privado");
    const boton=crearElemento("button","reproductor-play","▶");
    boton.type="button";

    const progreso=document.createElement("input");
    progreso.className="reproductor-progreso";
    progreso.type="range";
    progreso.min="0";
    progreso.max="100";
    progreso.step="0.1";
    progreso.value="0";

    const tiempo=crearElemento("span","reproductor-tiempo","0:00 / 0:00");
    const estado=crearElemento("p","pista-estado","Audio cifrado · se descifra al reproducirlo.");

    reproductor.appendChild(boton);
    reproductor.appendChild(progreso);
    reproductor.appendChild(tiempo);
    contenedor.appendChild(titulo);
    contenedor.appendChild(reproductor);
    contenedor.appendChild(estado);

    const pista={data:pistaData,boton,progreso,tiempo,estado,audio:null,objectUrl:null,cargando:false};
    pistas.push(pista);

    boton.addEventListener("click",async()=>{
        try{await reproducirPista(indice);}catch(error){console.error(error);}
    });

    progreso.addEventListener("input",()=>{
        if(pista.audio&&Number.isFinite(pista.audio.duration)&&pista.audio.duration>0){
            pista.audio.currentTime=(Number(progreso.value)/100)*pista.audio.duration;
        }
    });

    reproductor.addEventListener("contextmenu",e=>e.preventDefault());

    return contenedor;
}

function renderizarManifest(manifest){
    limpiarPistas();
    archivoProyectos.replaceChildren();
    tituloArchivo.textContent=manifest.title||"Canciones";

    for(const proyectoData of manifest.projects){
        const proyecto=crearElemento("section","proyecto");
        proyecto.appendChild(crearElemento("h2","",proyectoData.name||"Proyecto"));

        const tracks=Array.isArray(proyectoData.tracks)?proyectoData.tracks:[];
        for(const pistaData of tracks){
            proyecto.appendChild(crearPista(pistaData));
        }
        archivoProyectos.appendChild(proyecto);
    }
}

function bloquear(){
    limpiarPistas();
    masterKey=null;
    archivoProyectos.replaceChildren();
    panelArchivo.hidden=true;
    panelAcceso.hidden=false;
    claveAcceso.value="";
    setEstado("");
    claveAcceso.focus();
}

async function desbloquear(password){
    if(!window.crypto||!window.crypto.subtle)throw new Error("Web Crypto no disponible.");

    const config=await fetchJson(CONFIG_URL);
    if(config.version!==1||!config.kdf||!config.keyWrap)throw new Error("Config incompatible.");

    const candidateMasterKey=await descifrarClaveMaestra(password,config);
    const manifest=await cargarManifest(candidateMasterKey);

    masterKey=candidateMasterKey;
    renderizarManifest(manifest);
    panelAcceso.hidden=true;
    panelArchivo.hidden=false;
    claveAcceso.value="";
    setEstado("");
}

formularioAcceso.addEventListener("submit",async(evento)=>{
    evento.preventDefault();
    const password=claveAcceso.value;

    if(!password){
        setEstado("Introduce la contraseña.",true);
        return;
    }

    botonEntrar.disabled=true;
    botonEntrar.textContent="Comprobando…";
    setEstado("Verificando y descifrando el archivo privado…");

    try{
        await desbloquear(password);
    }catch(error){
        console.error(error);
        setEstado(
            location.protocol==="file:"
                ?"Abre esta página mediante Live Server o GitHub Pages."
                :"Contraseña incorrecta o archivo privado todavía no configurado.",
            true
        );
    }finally{
        botonEntrar.disabled=false;
        botonEntrar.textContent="Entrar";
    }
});

botonCerrar.addEventListener("click",bloquear);

window.addEventListener("beforeunload",()=>{
    limpiarPistas();
    masterKey=null;
});
})();
