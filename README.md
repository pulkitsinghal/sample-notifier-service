1. bring up default:

  ```
  docker-compose up
  docker-compose down
  ```
2. bring up for development:

  ```
  docker-compose -f docker-compose.local.yml down && docker-compose -f docker-compose.local.yml up --build
  docker-compose -f docker-compose.local.yml down
  ```
