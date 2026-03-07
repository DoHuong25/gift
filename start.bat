@echo off
echo Dang khoi dong server...
start "" http://localhost:8181
python -m http.server 8181
pause
