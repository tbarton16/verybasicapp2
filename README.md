# How to run
``` npm run build ```


```[Unit]
Description=Prompt Runner backend + client
After=network.target

[Service]
WorkingDirectory=/home/tessabarton/verybasicapp2
EnvironmentFile=/opt/prompt-runner/.env
ExecStart=/usr/bin/node /home/tessabarton/verybasicapp2/dist/index.js
Restart=on-failure
User=tessabarton
# Give Node access to port 5000
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```


``` sudo systemctl daemon-reload ```


``` sudo systemctl enable --now ngrok.service ```


``` sudo systemctl status ngrok.service --no-pager ```


``` sudo systemctl restart prompt-runner ```

```[Unit]
Description=Ngrok reverse proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/ngrok http --url=headroom-hunter.ngrok.app 5000 --region=us
Restart=on-failure
User=tessabarton

[Install]
WantedBy=multi-user.target

```
