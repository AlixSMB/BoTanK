export DOCKER_COMPOSE_VERSION=1.27.4
sudo apt-get install -y libhdf5-dev
sudo apt-get install -y libssl-dev
apt install -y python3
apt install -y python3-pip
sudo pip3 install docker-compose=="${DOCKER_COMPOSE_VERSION}"
pip install docker-compose