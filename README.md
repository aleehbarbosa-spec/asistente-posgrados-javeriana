# Asistente de Posgrados en Administración (Gemini + GitHub Pages)

Agente de IA en HTML + JavaScript que responde preguntas de aspirantes usando SOLO los documentos de la carpeta `contexto/`.

## Estructura
```
index.html          Interfaz del chat
css/style.css       Estilos
js/config.js        Configuración (modelo, contacto, lista de archivos de contexto)
js/app.js           Lógica: carga contexto, llama a Gemini, KPIs
contexto/agente/    Reglas, tono, formato y entregables del agente
contexto/programas/ Un .md por programa
contexto/admision/  Requisitos, proceso, costos, fechas, FAQ
contexto/kpis.md    Definición de métricas
```

## Puesta en marcha
1. **Completa los `.md`**: reemplaza cada `[COMPLETAR]` con información oficial.
2. **Edita `js/config.js`**: correo y WhatsApp de Posgrados.
3. **API key gratuita**: https://aistudio.google.com/apikey
4. **Sube a GitHub** y activa *Settings → Pages → Deploy from branch → main / root*.
5. Tu enlace será `https://TU-USUARIO.github.io/NOMBRE-REPO/`. Genera un QR con ese enlace.
6. Prueba local: `python -m http.server` y abre http://localhost:8000 (no funciona abriendo el archivo con doble clic, por el `fetch`).

## ⚠️ Seguridad de la API key
Nunca escribas la key dentro del código de un repo público. Dos opciones:
- **Pruebas**: deja `PROXY_URL` vacío; la página pide la key y la guarda solo en tu navegador.
- **Producción con QR (recomendado)**: crea un Cloudflare Worker gratuito que guarde la key como secreto y reenvíe la petición a Gemini; pon su URL en `PROXY_URL`.

```js
// Cloudflare Worker (variable secreta: GEMINI_KEY)
export default {
  async fetch(req, env) {
    const cors = {"Access-Control-Allow-Origin":"https://TU-USUARIO.github.io","Access-Control-Allow-Headers":"Content-Type"};
    if (req.method === "OPTIONS") return new Response(null,{headers:cors});
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${env.GEMINI_KEY}`,
      {method:"POST",headers:{"Content-Type":"application/json"},body:await req.text()});
    return new Response(r.body,{status:r.status,headers:{...cors,"Content-Type":"application/json"}});
  }
}
```

## Límites de la capa gratuita
Gemini gratis tiene límite de peticiones por minuto/día. Si hay mucho tráfico, el agente avisa y el usuario puede escribir al equipo.
Con ~10 archivos de contexto cortos todo cabe en cada petición; si crece mucho, divide por programa.
