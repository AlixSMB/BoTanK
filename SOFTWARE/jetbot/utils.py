# code from jetbot

import subprocess
import os

def get_ip_address(interface):
    state = get_network_interface_state(interface)
    if state == 'down' or state == None:
        return None

    cmd = "ifconfig %s | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1'" % interface
    return subprocess.check_output(cmd, shell=True).decode('ascii')[:-1]


def get_network_interface_state(interface):
    if not os.path.exists('/sys/class/net/%s/operstate' % interface):
        #print("%s file does NOT exist" % interface)
        return None

    try:
        status = subprocess.check_output('cat /sys/class/net/%s/operstate' % interface, shell=True).decode('ascii')[:-1]
    except Exception as err:
        print("Exception: {0}".format(err))
        return None
    else:
        return status
