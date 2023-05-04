import util # util.py
Object = util.Object

import numpy as np
import cv2
import cv2.aruco as aruco
import math

detect_params = aruco.DetectorParameters_create()
#detect_params.cornerRefinementMethod = aruco.CORNER_REFINE_SUBPIX
#estimate_param = aruco.EstimateParameters.create()
#estimate_param.pattern = aruco.CW_top_left_corner

def getTransformationMatrix(rvec, tvec, rmat=None):    # rvec and tvec straight from opencv function (with the weird shapes)
	# get rotation matrix from rotation vector
	rmat = cv2.Rodrigues(rvec)[0] if rmat is None else rmat
	transfo = np.zeros((4,4), np.float32)
	transfo[3,3] = 1
	transfo[0:3, 0:3] = rmat
	transfo[0:3, 3] = np.squeeze(tvec)
	return transfo
def getInvTransformationMatrix(rvec, tvec, rmat=None): #
	# get rotation matrix from rotation vector
	rmat = cv2.Rodrigues(rvec)[0] if rmat is None else rmat
	# get inverse of rotation matrix: inv(R) = transpose(R)
	invRMat = np.transpose(rmat)
	# get inverse of tranformation matrix (rotation + translation)
	# we use a fast method: https://stackoverflow.com/questions/2624422/efficient-4x4-matrix-inverse-affine-transform
	invTransfo = np.zeros((4,4), np.float32)
	invTransfo[3,3] = 1
	invTransfo[0:3, 0:3] = invRMat
	invTransfo[0:3, 3] = np.matmul(-invRMat, np.squeeze(tvec))
	return invTransfo

def update_marker_refs(m_obj, marker_i, local_corners, isGlobalOrig): # called when marker gets positioned relative to a new origin marker
	for refmarker_id in marker_i.in_refs: # update markers whose position is based on this one's
		refmarker_i = m_obj.cells_i[refmarker_id]
		
		# position "refmarker" relative to new ref of "marker"
		refmarker_i.transitionMat = np.matmul(marker_i.transitionMat, refmarker_i.transitionMat)
		for n in range(4):
			m_obj.cells_tmp[refmarker_id][n] = np.matmul(refmarker_i.transitionMat, local_corners[n])[:3]
			m_obj.cells_tmp[refmarker_id][n][1] *= -1 # flip y axis
		if isGlobalOrig : m_obj.cells[refmarker_id] = m_obj.cells_tmp[refmarker_id].copy()
		
		# move refmarker from previous refs list to new one
		m_obj.cells_i[refmarker_i.out_ref].in_refs.remove(refmarker_id) # TODO: use dict instead of list for in_refs ? (search time is linear for lists...)
		refmarker_i.out_ref = marker_i.out_ref
		m_obj.cells_i[marker_i.out_ref].in_refs.append(refmarker_id)
		
		update_marker_refs(m_obj, refmarker_i, local_corners, isGlobalOrig) # recurse
# generate corners and ids automatically from frames, using relative distances between markers
# all the markers must have the same known size
# "m_obj.cells" will contain all the markers which are positioned relative to the board origin marker
# (i.e: the marker with the smallest id)
def auto_make_board(cameradata, videoframe, m_obj, ms, dictio, mrange=[0,200]):
	newMarkers = False
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(ids) > 1:
		
		rvecs, tvecs, objpoints = aruco.estimatePoseSingleMarkers(corners, ms, cameradata['matrix'], cameradata['coeffs'])#, estimateParameters=estimate_param)
		local_corners = np.array([[-ms/2,ms/2,0,1],[ms/2,ms/2,0,1],[ms/2,-ms/2,0,1],[-ms/2,-ms/2,0,1]], dtype=np.float32) # CW center order [x,y,z,1]*4
		#local_corners = np.array([[0,0,0,1],[0,ms,0,1],[ms,ms,0,1],[ms,0,0,1]], dtype=np.float32) # CCW order [x,y,z,1]*4
		
		for mid in ids[:,0]:
			if mid < mrange[0] or mid > mrange[1] : continue # not a marker used for positioning 
			if not (mid in m_obj.cells_tmp): # discovered new marker
				newMarkers = True
				m_obj.cells_tmp[mid] = local_corners[:,:3].copy() # corner pos relative to ref (which should be origin marker once mapping is done)
				m_obj.cells_i[mid] = Object(
					in_refs=[],        # markers positioned relative to us (all should be relative to marker 0 once mapping is done)
					out_ref=None,      # marker we are positionned relative to
					transitionMat=None # [transitionMat] * [local pos] = [ref pos]
				)
		
		if newMarkers:
			orig_ind = np.argmin(ids)                   # local origin will be marker with smallest number or its origin
			orig_id = np.min(ids)
			orig_ref = m_obj.cells_i[orig_id].out_ref
			if orig_ref is not None:
				orig_invTransfo = np.matmul(m_obj.cells_i[orig_id].transitionMat, getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind]))
				orig_id = orig_ref
			else:
				orig_invTransfo = getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind])
				if orig_id < m_obj.orig: # update board global origin marker
					m_obj.orig = orig_id 
					m_obj.cells = {}
					m_obj.cells[orig_id] = local_corners[:,:3]
			
			orig_refs = m_obj.cells_i[orig_id].in_refs
			
			for i in range(len(ids)):
				mid = ids[i][0]
				if mid < mrange[0] or mid > mrange[1] : continue
				if mid == orig_id : continue
				marker_i = m_obj.cells_i[mid]
				if marker_i.out_ref is not None : continue # this marker is already positioned
				else : marker_i.out_ref = orig_id # this marker is positioned relative to orig_id
				mrvec = rvecs[i]
				mtvec = tvecs[i]
				
				marker_i.transitionMat = np.matmul(orig_invTransfo, getTransformationMatrix(mrvec, mtvec))
				# express points from local coords system to orig marker coords system
				for n in range(4):
					m_obj.cells_tmp[mid][n] = np.matmul(marker_i.transitionMat, local_corners[n])[:3]
					m_obj.cells_tmp[mid][n][1] *= -1 # flip y
				if m_obj.orig == orig_id : m_obj.cells[mid] = m_obj.cells_tmp[mid].copy()
				
				orig_refs.append(mid)
				update_marker_refs(m_obj, marker_i, local_corners, m_obj.orig == orig_id)
				
			# update board
			m_obj.board = aruco.Board_create(np.asarray(list(m_obj.cells.values()), np.float32), dictio, np.asarray(list(m_obj.cells.keys()), int))
			
		#for i in range(len(ids)) :
		#	cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvecs[i], tvecs[i], 0.035)
	
	return newMarkers

# get pos / rot of camera relative to board, the video frame should be distorsion free ! 
maxPosDelta = 0.1 # in m
#maxDirDelta = 0.
nb_outliers = 0
max_outliers = 10
def getBoardTransform(cameradata, videoframe, board, dictio, transfo=None):
	global nb_outliers
	
	if board is None : return None
	
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		#corners, ids, _,_ = aruco.refineDetectedMarkers(videoframe, board, corners, ids, rejectedCorners)
		nb_markers, rvec, tvec = aruco.estimatePoseBoard(corners, ids, board, cameradata['matrix'], cameradata['coeffs'], None, None)
		
		if nb_markers > 0:
			# laggy as hell in some situations ...
			#aruco.drawDetectedMarkers(videoframe, corners, ids)
			#cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, 0.7)
			
			rmat = cv2.Rodrigues(rvec)[0]
			newTransfo = getTransformationMatrix(rvec, tvec, rmat)
			invTransfo = getInvTransformationMatrix(rvec, tvec, rmat)
			
			# get cam pos (transform [0,0,0] from cam coords to board coords)
			cam_pos = np.matmul(invTransfo, np.array([0,0,0,1]))
			if transfo is not None and nb_outliers < max_outliers and (abs(cam_pos[0]-transfo[0][0]) >= maxPosDelta or abs(cam_pos[1]-transfo[0][1])) >= maxPosDelta: 
				nb_outliers += 1
				return transfo # remove outlier data
			else : nb_outliers = 0;
			
			# get cam rotation around board z
			# transform the optical axis (vector [0,0,1]) from cam coords to board coords
			# we must transform both points of the camera z-axis vector
			cam_forward = np.matmul(invTransfo, np.array([0,0,1,1], np.float32)) - cam_pos
			# project unto (x,y) plane of board
			cam_forward[:2] /= np.linalg.norm(cam_forward[:2])
			
			return (cam_pos, cam_forward[:2], newTransfo, invTransfo)
		else : return None
	else : return None

def getMarkedObstacles(cameradata, videoframe, dictio, mrange, s, n, collider, transfo):
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		keptIds = [ mid[0] for mid in ids if mid[0] >= mrange[0] and mid[0] <= mrange[1] ]
		if len(keptIds) == 0 : return
		
		rvecs, tvecs, objpoints = aruco.estimatePoseSingleMarkers(np.array(keptCorners, dtype=np.float32), s, cameradata['matrix'], cameradata['coeffs'])
		
		# group markers together if they are part of the same obstacle (same id)
		for i in range(len(inds)) : 
			if not inds[i][0] in keptIds : continue
			if not inds[i][0] in grouped_inds : grouped_inds[inds[i][0]] = []
			grouped_inds[inds[i][0]].append(i)
		
		# express corners in camera coords
		local_corners = np.array([[-s/2,s/2,0,1],[s/2,s/2,0,1],[s/2,-s/2,0,1],[-s/2,-s/2,0,1]], dtype=np.float32) # CW center order [x,y,z,1]*4
		cam_points = []
		for inds in grouped_inds.values():
			cam_points.append([]) # new object
			for ind in inds:
				marker_transfo = np.matmul(transfo[3], getTransformationMatrix(rvecs[ind], tvecs[ind])) # marker -> camera -> board
				for i in range(4) : cam_points[-1].append( np.matmul(marker_transfo, local_corners[i])[:3] )
		
		# generate 2D colliders for obstacles
		obstacles = []
		if collider == 'AABB':
			for obj_pnts in cam_points:
				minX, minY = 999999
				maxX, maxY = 999999
				# don't care about z
				for pnt in obj_pnts:
					maxX = max(maxX, pnt[0] ; minX = min(minX, pnt[0])
					maxY = max(maxY, pnt[1] ; minY = min(minY, pnt[1])
				obstacles.append(minX, minY, maxX, maxY)
		else: # Sphere
			pass
		
		return obstacles

# For testing
#import pickle
##camW = 1280 ; camH = 720
##GST_STRING = \
##	'nvarguscamerasrc ! '\
##	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
##	'nvvidconv ! '\
##	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
##	'videoconvert ! '\
##	'video/x-raw, format=(string)BGR ! '\
##	'appsink'.format(
##			width=camW,
##			height=camH,
##			fps=30,
##			capture_width=camW,
##			capture_height=camH
##	)
##cap = util.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER)
#cap = cv2.VideoCapture(0)
#cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)
#CAMERADATA_FILENAME = "laptopcam_fisheye_params_2"
#print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
#with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)
#ids, corners = util.getGridMarkers(5, 8, 0.014, 0.014)
#dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)
#board = aruco.Board_create(corners[:10], dictio, ids[:10])
#def loop():
#	while True:
#		
#		image = util.fisheye_undistort(cameradata, cap.read()[1])
#		
#		res = getBoardTransform(cameradata, image, board, dictio)
#		
#		cv2.imshow("image", cv2.resize(image, (700, 600)))
#		#cv2.imshow("image tordue", cv2.resize(cap.read()[1], (700, 600)))
#		
#		if cv2.waitKey(round(1000/30)) == ord('q') : return 
#loop()
#board.ids = ids ; board.corners = corners
#loop()

# TODO:
# check that positioning with the presence of markers not in board still works
# - allow different sized markers, provide size for each marker
# - try to reuse last tvec,rvec as guess for pos. estimation ?
