# code from jetbot

import time

# For Jetson Hardware
from utils import get_ip_address

# For Adafruit Hardware
import Adafruit_SSD1306
from PIL import Image
from PIL import ImageDraw
from PIL import ImageFont


# Initialize Display-----------------------------------------------------------
# Try to connect to the OLED display module via I2C.
disp1 = Adafruit_SSD1306.SSD1306_128_32(rst=None, i2c_bus=1, gpio=1) # setting gpio to 1 is hack to avoid platform detection
try:
	# Initiallize Display
	disp1.begin()

	# Clear display.
	disp1.clear()
	disp1.display()

	# Create blank image for drawing.
	# Make sure to create image with mode '1' for 1-bit color.
	width = disp1.width
	height = disp1.height
	image = Image.new('1', (width, height))

	# Get drawing object to draw on image.
	draw = ImageDraw.Draw(image)

	# Draw a black filled box to clear the image.
	draw.rectangle((0,0,width,height), outline=0, fill=0)

	# Draw some shapes.
	# First define some constants to allow easy resizing of shapes.
	padding = -2
	top = padding
	bottom = height-padding
	# Move left to right keeping track of the current x position for drawing shapes.
	x = 0

	# Load default font.
	font = ImageFont.load_default()

	# Draw a black filled box to clear the image.
	draw.rectangle((0,0,width,height), outline=0, fill=0)
except OSError as err:
	print("OS error: {0}".format(err))
	time.sleep(5)

while True:
	time.sleep(10)
	
	# Check Eth0, Wlan0, and Wlan1 Connections---------------------------------
	a = 0    # Indexing of Connections
	# Checks for Ethernet Connection
	try:
		eth = get_ip_address('eth0')
		if eth != None:
			a = a + 1
	except Exception as e:
		print(e)
		continue
	# Checks for WiFi Connection on wlan0
	try:
		wlan0 = get_ip_address('wlan0')
		if wlan0 != None:
			a = a + 2
	except Exception as e:
			print(e)
			continue
	# Checks for WiFi Connection on wlan1
	try:
		wlan1 = get_ip_address('wlan1')
		if wlan1 != None:
			a = a + 4
	except Exception as e:
		print(e)
		continue


	try:
		# Draw a black filled box to clear the image.
		draw.rectangle((0,0,width,height), outline=0, fill=0)
		
		# IP address
		if a == 1:
			draw.text((x, top),       "eth0: " + str(eth),  font=font, fill=255)
		elif a == 2:
			draw.text((x, top+8),     "wlan0: " + str(wlan0), font=font, fill=255)
		elif a == 3:
			draw.text((x, top),       "eth0: " + str(eth),  font=font, fill=255)
			draw.text((x, top+8),     "wlan0: " + str(wlan0), font=font, fill=255)
		elif a == 4:
			draw.text((x, top+8),     "wlan1: " + str(wlan1), font=font, fill=255)
		elif a == 5:
			draw.text((x, top),       "eth0: " + str(eth),  font=font, fill=255)
			draw.text((x, top+8),     "wlan1: " + str(wlan1), font=font, fill=255)
		else:
			draw.text((x, top),       "No Connection!",  font=font, fill=255)

		# Display image.
		disp1.image(image)
		disp1.display()
		
	except OSError as err:
		print("OS error: {0}".format(err))
		continue
	except Exception as e:
		print(e)
		continue
