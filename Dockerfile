FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_NEO4J_URI
ARG VITE_NEO4J_DB_NAME
ARG VITE_NEO4J_USER
ARG VITE_NEO4J_PASSWORD

ENV VITE_NEO4J_URI=$VITE_NEO4J_URI
ENV VITE_NEO4J_DB_NAME=$VITE_NEO4J_DB_NAME
ENV VITE_NEO4J_USER=$VITE_NEO4J_USER
ENV VITE_NEO4J_PASSWORD=$VITE_NEO4J_PASSWORD

RUN npm run build

EXPOSE 5173

CMD npm run preview -- --host 0.0.0.0 --port 5173

#En caso de que se quiera lanzar como dev: CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
