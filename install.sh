#! /bin/bash
RP_MAILROOM_URL="http://mailroom:8090"
RP_DOMAIN_NAME="localhost"
RP_HOST_PORT="8000"
RP_DJANGO_DEBUG="off"
RP_SEND_MESSAGES="on"
RP_SEND_WEBHOOKS="on"
RP_SEND_EMAILS="on"
RP_SEND_AIRTIME="on"
RP_SEND_CALLS="on"
RP_IS_PROD="on"
RP_DATABASE_URL="postgresql://postgres:postgres@postgresql/rapidpro"
REDIS_URL="redis://redis:6379/0"
RP_SECRET_KEY="super-secret-key"
RP_MANAGEPY_COLLECTSTATIC="on"
RP_MANAGEPY_COMPRESS="on"
RP_MANAGEPY_INIT_DB="on"
RP_MANAGEPY_MIGRATE="on"
COURIER_DOMAIN="localhost"
MEDIATOR_REGISTER=false
MEDIATOR_API_TRUST_SELF_SIGNED=true
MEDIATOR_API_USERNAME="root@openhim.org"
MEDIATOR_API_PASSWORD="openhim-password"
ELASTIC_BASE_URL="http://elasticsearch:9200"
if [ "$EUID" -ne 0 ]
  then echo "Please run as root"
  exit
fi
echo "" > start.sh
chmod ugo+x start.sh
APP_PORT=$(whiptail --title "HAPI FHIR Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "emNutt Port" 10 60 3002 3>&1 1>&2 2>&3)
APP_BASE_URL=$(whiptail --title "HAPI FHIR Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "emNutt Base URL" 10 60 http://localhost:$APP_PORT/emNutt 3>&1 1>&2 2>&3)

selComponents=$(whiptail --checklist --separate-output "Select components to be installed" 10 60 5 \
              HAPI 'FHIR Server' off \
              openHIM 'Interoperability Layer' off \
              Rapidpro 'SMS Engine' off \
              Elasticsearch 'Data Indexing' off \
              Kibana 'Data Visualization' off \
              --title "Select components to be installed" 3>&1 1>&2 2>&3)

if [[ "$selComponents" != *"HAPI"* ]]; then
  MACM_BASE_URL=$(whiptail --title "HAPI FHIR Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Base URL" 10 60 http://localhost:8080/hapi-fhir-jpaserver/fhir 3>&1 1>&2 2>&3)
  MACM_USERNAME=$(whiptail --title "HAPI FHIR Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Username" 10 60 3>&1 1>&2 2>&3)
  MACM_PASSWORD=$(whiptail --title "HAPI FHIR Configuration" --backtitle "emNutt Installation" --ok-button "Next" --passwordbox "Password" 10 60 3>&1 1>&2 2>&3)
fi

if [[ "$selComponents" != *"Rapidpro"* ]]; then
  RAPIDPRO_BASE_URL=$(whiptail --title "Rapidpro Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Server Base URL" 10 60 http://localhost:8000 3>&1 1>&2 2>&3)
  RAPIDPRO_TOKEN=$(whiptail --title "Rapidpro Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Token" 10 60 3>&1 1>&2 2>&3)
  whiptail --title "Rapidpro Configuration" --backtitle "emNutt Installation" --ok-button "Next" --yesno "Sync All Contacts" 10 60 3>&1 1>&2 2>&3
  syncAllContacts=$?
  if [ $syncAllContacts = 0 ]; then
    RAPIDPRO_SYNC_ALL_CONTACTS='true'
  else
      RAPIDPRO_SYNC_ALL_CONTACTS='false'
  fi
fi

if [[ "$selComponents" != *"Elasticsearch"* ]]; then
  ELASTIC_BASE_URL=$(whiptail --title "Elasticsearch Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Server Base URL" 10 60 http://localhost:9200 3>&1 1>&2 2>&3)
  ELASTIC_USERNAME=$(whiptail --title "Elasticsearch Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Server Username" 10 60 3>&1 1>&2 2>&3)
  ELASTIC_PASSWORD=$(whiptail --title "Elasticsearch Configuration" --backtitle "emNutt Installation" --ok-button "Next" --passwordbox "Server Password" 10 60 3>&1 1>&2 2>&3)
fi

if [[ "$selComponents" != *"Kibana"* ]]; then
  KIBANA_BASE_URL=$(whiptail --title "Kibana Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Server Base URL" 10 60 http://localhost:5601 3>&1 1>&2 2>&3)
  KIBANA_USERNAME=$(whiptail --title "Kibana Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Server Username" 10 60 3>&1 1>&2 2>&3)
  KIBANA_PASSWORD=$(whiptail --title "Kibana Configuration" --backtitle "emNutt Installation" --ok-button "Next" --passwordbox "Server Password" 10 60 3>&1 1>&2 2>&3)
fi

if [[ "$selComponents" != *"openHIM"* ]]; then
  if (whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --yesno "Do you want to run emNutt behind openHIM?" 10 60)
  then
    MEDIATOR_API_URL=$(whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Mediator API URL" 10 60 https://localhost:8080 3>&1 1>&2 2>&3)
    MEDIATOR_API_USERNAME=$(whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Mediator API Username" 10 60 3>&1 1>&2 2>&3)
    MEDIATOR_API_PASSWORD=$(whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --ok-button "Next" --passwordbox "Mediator API Password" 10 60 3>&1 1>&2 2>&3)
    whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --ok-button "Next" --yesno "Trust Self Signed" 10 60 3>&1 1>&2 2>&3
    trustSelfSigned=$?
    if [ $trustSelfSigned = 0 ]; then
      MEDIATOR_API_TRUST_SELF_SIGNED="true"
    else
        MEDIATOR_API_TRUST_SELF_SIGNED="false"
    fi
    MEDIATOR_ROUTER_URL=$(whiptail --title "OpenHIM Configuration" --backtitle "emNutt Installation" --ok-button "Next" --inputbox "Router Base URL" 10 60 http://localhost:5001 3>&1 1>&2 2>&3)
    MEDIATOR_REGISTER="true"
  fi
else
  MEDIATOR_REGISTER="true"
fi

mapfile -t components <<< "$selComponents"

echo '#! /bin/bash
  if [ "$EUID" -ne 0 ]
    then echo "Please run as root"
    exit
  fi
  source docker_env_vars
  echo "
  version: \"3.3\"
  networks:
    emnutt:

  services:
    emnutt:
      build: .
      ports:
        - \"$APP_PORT:$APP_PORT\"
      restart: unless-stopped
      networks:
        emnutt:
      environment:
        NODE_ENV: docker
        APP_PORT: $APP_PORT
        APP_BASE_URL: $APP_BASE_URL
        APP_INSTALLED: \"false\"
        MACM_BASE_URL: $MACM_BASE_URL
        MACM_USERNAME: $MACM_USERNAME
        MACM_PASSWORD: $MACM_PASSWORD
        RAPIDPRO_BASE_URL: $RAPIDPRO_BASE_URL
        RAPIDPRO_TOKEN: $RAPIDPRO_TOKEN
        RAPIDPRO_SYNC_ALL_CONTACTS: \"$RAPIDPRO_SYNC_ALL_CONTACTS\"
        ELASTIC_BASE_URL: $ELASTIC_BASE_URL
        ELASTIC_USERNAME: $ELASTIC_USERNAME
        ELASTIC_PASSWORD: $ELASTIC_PASSWORD
        KIBANA_BASE_URL: $KIBANA_BASE_URL
        KIBANA_USERNAME: $KIBANA_USERNAME
        KIBANA_PASSWORD: $KIBANA_PASSWORD
        MEDIATOR_API_URL: $MEDIATOR_API_URL
        MEDIATOR_API_USERNAME: $MEDIATOR_API_USERNAME
        MEDIATOR_API_PASSWORD: $MEDIATOR_API_PASSWORD
        MEDIATOR_API_TRUST_SELF_SIGNED: \"$MEDIATOR_API_TRUST_SELF_SIGNED\"
        MEDIATOR_ROUTER_URL: $MEDIATOR_ROUTER_URL
        MEDIATOR_REGISTER: \"$MEDIATOR_REGISTER\"
        MEDIATOR_API_USERNAME: $MEDIATOR_API_USERNAME
        MEDIATOR_API_PASSWORD: $MEDIATOR_API_PASSWORD' > start.sh

for component in "${components[@]}"; do
  if [ "$component" == "HAPI" ];
  then
  echo "
    fhir:
      container_name: hapi-fhir
      image: hapiproject/hapi:latest
      networks:
        emnutt:
      ports:
        - '8080:8080'" >> start.sh
  fi
  if [ "$component" == "Elasticsearch" ];
  then
  echo "
    elasticsearch:
      container_name: elasticsearch
      image: elasticsearch:7.6.2
      environment:
        - node.name=elasticsearch
        - cluster.name=es-docker-cluster
        - discovery.seed_hosts=elasticsearch
        - cluster.initial_master_nodes=elasticsearch
        - bootstrap.memory_lock=true
        - 'ES_JAVA_OPTS=-Xms512m -Xmx512m'
      ulimits:
        memlock:
          soft: -1
          hard: -1
      networks:
        emnutt:
      ports:
        - '9200:9200'" >> start.sh
  fi
  if [ "$component" == "Kibana" ];
  then
  echo "
    kibana:
      container_name: kibana
      image: kibana:7.6.2
      networks:
        emnutt:
      ports:
        - '5601:5601'" >> start.sh
  fi
  if [ "$component" == "openHIM" ];
  then
  echo "
    mongo-db:
      container_name: mongo-db
      image: mongo:latest
      networks:
        - emnutt
      restart: unless-stopped
      environment:
        NODE_ENV: 'docker'

    openhim-core:
      container_name: openhim-core
      image: jembi/openhim-core:latest
      restart: unless-stopped
      environment:
        mongo_url: 'mongodb://mongo-db/openhim-development'
        mongo_atnaUrl: 'mongodb://mongo-db/openhim-development'
        NODE_ENV: 'development'
      ports:
        - '5000:5000'
        - '5001:5001'
        - '8081:8080'
      networks:
        - emnutt
      healthcheck:
        test: 'curl -sSk https://openhim-core:8080/heartbeat || exit 1'
        interval: 30s
        timeout: 30s
        retries: 3

    openhim-console:
      container_name: openhim-console
      image: jembi/openhim-console:latest
      restart: unless-stopped
      networks:
        - emnutt
      ports:
        - '9000:80'
      healthcheck:
        test: 'curl -sS http://openhim-console || exit 1'
        interval: 30s
        timeout: 30s
        retries: 3" >> start.sh
  fi
  if [ "$component" == "Rapidpro" ];
  then
  echo "
    rapidpro:
      image: rapidpro/rapidpro:v4
      depends_on:
        - redis
        - postgresql
      ports:
        - '$RP_HOST_PORT:8000'
      environment:
          MAILROOM_URL: \\\"$RP_MAILROOM_URL\\\"
          DOMAIN_NAME: \\\"$RP_DOMAIN_NAME\\\"
          DJANGO_DEBUG: \\\"$RP_DJANGO_DEBUG\\\"
          DATABASE_URL: $RP_DATABASE_URL
          REDIS_URL: $REDIS_URL
          SECRET_KEY: $RP_SECRET_KEY
          MANAGEPY_COLLECTSTATIC: \\\"$RP_MANAGEPY_COLLECTSTATIC\\\"
          MANAGEPY_COMPRESS: \\\"$RP_MANAGEPY_COMPRESS\\\"
          MANAGEPY_INIT_DB: \\\"$RP_MANAGEPY_INIT_DB\\\"
          MANAGEPY_MIGRATE: \\\"$RP_MANAGEPY_MIGRATE\\\"
          SEND_MESSAGES: \\\"$RP_SEND_MESSAGES\\\"
          SEND_WEBHOOKS: \\\"$RP_SEND_WEBHOOKS\\\"
          SEND_EMAILS: \\\"$RP_SEND_EMAILS\\\"
          SEND_AIRTIME: \\\"$RP_SEND_AIRTIME\\\"
          SEND_CALLS: \\\"$RP_SEND_CALLS\\\"
          IS_PROD: \\\"$RP_IS_PROD\\\"

    celery_base:
      image: rapidpro/rapidpro:v4
      depends_on:
        - rapidpro
      links:
        - redis
        - postgresql
      environment:
          DATABASE_URL: postgresql://postgres:postgres@postgresql/rapidpro
          REDIS_URL: redis://redis:6379/0
          SECRET_KEY: super-secret-key
      command:
        [
          '/venv/bin/celery',
          '--beat',
          '--app=temba',
          'worker',
          '--loglevel=INFO',
          '--queues=celery,flows',
        ]
    celery_msgs:
      image: rapidpro/rapidpro:v4
      depends_on:
        - rapidpro
      links:
        - redis
        - postgresql
      environment:
          DATABASE_URL: postgresql://postgres:postgres@postgresql/rapidpro
          REDIS_URL: redis://redis:6379/0
          SECRET_KEY: super-secret-key
      command:
        [
          '/venv/bin/celery',
          '--app=temba',
          'worker',
          '--loglevel=INFO',
          '--queues=msgs,handler',
        ]
    redis:
      image: redis:alpine

    postgresql:
      image: mdillon/postgis:9.6
      environment:
        - POSTGRES_DB=rapidpro

    courier:
      image: praekeltfoundation/courier
      depends_on:
        - rapidpro
      links:
        - redis
        - postgresql
      environment:
          COURIER_DOMAIN: \\\"$COURIER_DOMAIN\\\"
          COURIER_SPOOL_DIR: /tmp/courier/
          COURIER_DB: postgres://postgres:postgres@postgresql/rapidpro
          COURIER_REDIS: redis://redis:6379/8

    mailroom:
      image: praekeltfoundation/mailroom
      depends_on:
        - rapidpro
      links:
        - redis
        - postgresql
      environment:
          MAILROOM_ADDRESS: 'localhost'
          MAILROOM_DOMAIN: 'localhost'
          MAILROOM_DB: postgres://postgres:postgres@postgresql/rapidpro?sslmode=disable
          MAILROOM_REDIS: redis://redis:6379/15
          MAILROOM_ELASTIC: $ELASTIC_BASE_URL
      ports:
        - '8090:8090'" >> start.sh
  fi
done
echo "\">docker-compose.yaml
docker-compose up" >> start.sh
echo "
APP_PORT=$APP_PORT
APP_BASE_URL=$APP_BASE_URL
MACM_BASE_URL=$MACM_BASE_URL
MACM_USERNAME=$MACM_USERNAME
MACM_PASSWORD=$MACM_PASSWORD
RAPIDPRO_BASE_URL=$RAPIDPRO_BASE_URL
RAPIDPRO_TOKEN=$RAPIDPRO_TOKEN
RAPIDPRO_SYNC_ALL_CONTACTS=$RAPIDPRO_SYNC_ALL_CONTACTS
RP_MAILROOM_URL=$RP_MAILROOM_URL
RP_DOMAIN_NAME=$RP_DOMAIN_NAME
RP_HOST_PORT=$RP_HOST_PORT
RP_DJANGO_DEBUG=\\\"$RP_DJANGO_DEBUG\\\"
RP_DATABASE_URL=$RP_DATABASE_URL
REDIS_URL=$REDIS_URL
RP_SECRET_KEY=$RP_SECRET_KEY
RP_MANAGEPY_COLLECTSTATIC=$RP_MANAGEPY_COLLECTSTATIC
RP_MANAGEPY_COMPRESS=$RP_MANAGEPY_COMPRESS
RP_MANAGEPY_INIT_DB=$RP_MANAGEPY_INIT_DB
RP_MANAGEPY_MIGRATE=$RP_MANAGEPY_MIGRATE
RP_SEND_MESSAGES=$RP_SEND_MESSAGES
RP_SEND_WEBHOOKS=$RP_SEND_WEBHOOKS
RP_SEND_EMAILS=$RP_SEND_EMAILS
RP_SEND_AIRTIME=$RP_SEND_AIRTIME
RP_SEND_CALLS=$RP_SEND_CALLS
RP_IS_PROD=$RP_IS_PROD
COURIER_DOMAIN=$COURIER_DOMAIN
ELASTIC_BASE_URL=$ELASTIC_BASE_URL
ELASTIC_USERNAME=$ELASTIC_USERNAME
ELASTIC_PASSWORD=$ELASTIC_PASSWORD
KIBANA_BASE_URL=$KIBANA_BASE_URL
KIBANA_USERNAME=$KIBANA_USERNAME
KIBANA_PASSWORD=$KIBANA_PASSWORD
MEDIATOR_API_URL=$MEDIATOR_API_URL
MEDIATOR_API_USERNAME=$MEDIATOR_API_USERNAME
MEDIATOR_API_PASSWORD=$MEDIATOR_API_PASSWORD
MEDIATOR_API_TRUST_SELF_SIGNED=$MEDIATOR_API_TRUST_SELF_SIGNED
MEDIATOR_ROUTER_URL=$MEDIATOR_ROUTER_URL
MEDIATOR_REGISTER=$MEDIATOR_REGISTER
ELASTIC_BASE_URL=$ELASTIC_BASE_URL
" > docker_env_vars

./update-ohim-console.sh &
./start.sh