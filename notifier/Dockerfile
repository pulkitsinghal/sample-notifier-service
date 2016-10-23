FROM node:4
WORKDIR "/apps/notifier"
COPY ./notifier.js .
COPY ./package.json .
COPY ./npm-shrinkwrap.json .
RUN ls -alrt
RUN npm install
EXPOSE 3001
CMD ["node", "notifier.js"]
