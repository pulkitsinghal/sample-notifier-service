# Run it
1. Bring up the development env for demo:
  1. To tear down any previous runs: `docker-compose -f docker-compose.local.yml down`
  1. To run: `docker-compose -f docker-compose.local.yml up --build`

# Current Architecture
![Current Architecture](/sequence%20diagram%201.png?raw=true "Current Architecture")

## Pros
* No need for authentication in the `notifier` service as the `socketId` assigned to each webapp is just as random as any password and short lived (user may close the browser/tab when finished).

## Cons
* The current `notifier` service does not scale well.
  * If we scaled up as-is then each instance will manage its own websocket connections
  * For example, `docker-compose scale notifier=2`:
    * `notifier_1` will manage `socketIds=[x,y,z]`
    * `notifier_2` will manage `socketIds=[a,b,c]`
    * a worker request to notify `socketId=a` might get routed to `notifier_1` and that wouldn't be very helpful
      * if the `notifier` service was updated to be backed by a pub/sub queue so that workers could publish notifications to the queue directly and all the notifier instances could subscribe to the queue then notifier service would scale better.
* If `socketId` changes because the webapp is refreshed or the user restarts browser/tab:
  * Any background tasks that were kicked off before such an action will not be able to send notification. Because the previous websocket connection (referenced by the outdated socketId) will no longer be active.
