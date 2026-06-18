$root = $PSScriptRoot

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host "resumes-gpt dev servers starting..." -ForegroundColor Green
Write-Host "  Backend  -> http://localhost:8000" -ForegroundColor Cyan
Write-Host "  Frontend -> http://localhost:5173" -ForegroundColor Magenta
