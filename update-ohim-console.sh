#! /bin/bash
# docker cp openhim-console:/usr/share/nginx/html/config/default.json .
# sed 's/8080,/8081,/g' default.json > tmp.json;mv tmp.json default.json
# docker cp default.json openhim-console:/usr/share/nginx/html/config/default.json

counter=0
until [ "$status" = 0 ]
do
docker cp openhim-console:/usr/share/nginx/html/config/default.json . > /dev/null 2>&1
status=$?
if [  $counter -eq 100 ]
  then
  echo "OpenHIM Console is not properly configured and may have issues communicating with openHIM Core"
  status=0
fi
counter=$((counter+1))
sleep 2
done

sed 's/8080,/8081,/g' default.json > tmp.json;mv tmp.json default.json
docker cp default.json openhim-console:/usr/share/nginx/html/config/default.json