FROM nginx:stable-alpine

COPY index.html styles.css questions.js game.js /usr/share/nginx/html/

EXPOSE 80
