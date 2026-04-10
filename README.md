# NACHTIVIGIL

## Ollama CORS

Browser access to Ollama requires CORS to be enabled.

Windows PowerShell:

```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

If Ollama is running as a background service, set `OLLAMA_ORIGINS=*` in that service's environment instead.

## llama.cpp

`llama.cpp` is supported through `llama-server` using its OpenAI-compatible `POST /v1/chat/completions` endpoint.

Example:

```powershell
llama-server -m C:\models\your-model.gguf --port 8080
```

Then set the provider to `llama.cpp (ローカル)` and point the URL at `http://localhost:8080`.
