from util import getChessBoardCorners # util.py

import numpy as np
import cv2
#import pickle
#import glob
#import os

#img_samples = glob.glob('calibration_images/*.jpg')
#img_size = cv2.imread(img_samples[0]).shape[:2]
#print(f"Using {len(img_samples)} images of size {img_size}")

#chess_s = 0.022 # cell size in meters
#print(f"Using a cell size of {chess_s} m")
#chess_w = 10
#chess_h = 6
#cb_corners = np.asarray([getChessBoardCorners(chess_w, chess_h, chess_s)], np.float32)
#print(f"Using a {chess_w}x{chess_h} grid")

def get_params(chess_s, chess_w, chess_h, img_size, img_samples):
	cb_corners = np.asarray([getChessBoardCorners(chess_w, chess_h, chess_s)], np.float32)
	obj_points_arr = []
	nb_points = (chess_w-1)*(chess_h-1) # in one image
	px_points_arr = []
	
	i=0
	for img_sample in img_samples:
		i+=1
		print(f"Processing image \"{img_sample}\"... ({i}/{len(img_samples)})")
		
		image = cv2.cvtColor(cv2.imread(img_sample), cv2.COLOR_BGR2GRAY)
		if image.shape[:2] != img_size:
			printf(f"Size of image \"{img_sample}\" is not equal to {img_size}, ignoring this sample")
			continue
		
		ret, px_points = cv2.findChessboardCorners(
			image, (chess_w-1, chess_h-1), 
			flags=cv2.CALIB_CB_ADAPTIVE_THRESH+cv2.CALIB_CB_NORMALIZE_IMAGE
		)
		
		if not ret or len(px_points) != nb_points:
			print(f"Found {len(px_points) if ret else 0} points found instead of {nb_points} for image \"{img_sample}\", ignoring this sample")
			continue
		
		obj_points_arr.append(cb_corners)
		px_points_arr.append( cv2.cornerSubPix(image, px_points, (3,3), (-1,-1), (cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER, 30, 0.1)) )
		
		#while(True):
		#	cv2.imshow("test", image)
		#	if cv2.waitKey(1) == ord('q') : break
	
	print("Computing camera parameters...")
	# [!] imgsize has to be flipped (form [height,width] to [width,height]) [!]
	img_size = img_size[::-1]
	ret, mtx, dist, _,_ = cv2.calibrateCamera(obj_points_arr, px_points_arr, img_size, None, None)
	return mtx, dist

#mtx, dist = get_params(chess_s, chess_w, chess_h, img_size, img_samples)
#print(f"matrix: {mtx}\ncoeffs: {dist}")
#
## export params to file
#i=1
#filename = f"laptopcam_params_"
#while os.path.exists(filename+str(i)) : i+=1
#filename += str(i)
#with open(filename, "wb") as filecamera : pickle.dump({"matrix": mtx, "coeffs": dist}, filecamera, 0)
#print(f"Camera calibration params written to \"{filename}\"")
