import util # util.py
Object = util.Object

import numpy as np
import scipy
from scipy.spatial import ConvexHull
import cv2
import cv2.aruco as aruco
import math

detect_params = aruco.DetectorParameters_create()
#detect_params.adaptiveThreshConstant = 1
detect_params.cornerRefinementMethod = aruco.CORNER_REFINE_SUBPIX
max_reprerr = 0.4

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

def getMarkers(cameradata, videoframe, dictio, transfo, dbview=False):
	res = [[], []] # [corners, ids]
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		res[0] = corners
		res[1] = ids
		if dbview:
			aruco.drawDetectedMarkers(videoframe, corners, ids)
			
			local_corners = np.array([[0,0,0,1],[1,0,0,1],[1,1,0,1],[0,1,0,1]], dtype=np.float32) # CW top left order, x right, y bottom [x,y,z,1]*4
			for i in range(len(ids)):
				if transfo is not None : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE, rvec=transfo[4], tvec=transfo[5])
				else                   : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_ITERATIVE)
				
				if np.squeeze(reprErr) <= max_reprerr : cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec[0], tvec[0], 1)
	
	return res

def update_marker(m_obj, mid, oid, newTransMat, local_corners, isGlobalOrig): # called when marker gets positioned relative to a new origin marker
	marker_i = m_obj.cells_i[mid]
	orig_i   = m_obj.cells_i[oid]
	
	if marker_i.out_ref is not None : m_obj.cells_i[marker_i.out_ref].in_refs.remove(mid)
	marker_i.out_ref = oid
	orig_i.in_refs.append(mid)
	
	marker_i.transitionMat = newTransMat
	# express points from local coords system to orig marker coords system
	for n in range(4): 
		m_obj.cells_tmp[mid][n] = np.matmul(marker_i.transitionMat, local_corners[n])[:3]
		#m_obj.cells_tmp[mid][n][2] = 0 # planar board
	if isGlobalOrig : m_obj.cells[mid] = np.copy(m_obj.cells_tmp[mid])
	
	# update markers whose position is based on this one's
	for rid in marker_i.in_refs:
		refm_i = m_obj.cells_i[rid]
		update_marker(m_obj, rid, oid, np.matmul(marker_i.transitionMat, refm_i.transitionMat), np.copy(local_corners), isGlobalOrig) # recurse
# generate corners and ids automatically from frames, using relative distances between markers ; all the markers must have the same known size
# "m_obj.cells" will contain all the markers which are positioned relative to the board origin marker (i.e: the marker with the smallest id)
def auto_make_board(cameradata, videoframe, m_obj, ms, corners, ids, mrange, transfo):
	
	if len(ids) <= 1 : return False
	
	local_corners = np.array([[0,0,0,1],[ms,0,0,1],[ms,ms,0,1],[0,ms,0,1]], dtype=np.float32) # CW top left order, x right, y bottom [x,y,z,1]*4
	rvecs = [] ; tvecs = []
	keptIds = []
	for i in range(len(ids)):
		if ids[i][0] < mrange[0] or ids[i][0] > mrange[1] : continue # not a marker used for positioning 
		
		if transfo is not None : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE, rvec=transfo[4], tvec=transfo[5])
		else                   : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_ITERATIVE)
		
		if np.squeeze(reprErr) <= max_reprerr : 
			keptIds.append(ids[i][0])
			rvecs.append(rvec[0]) ; tvecs.append(tvec[0])
	
	if len(keptIds) <= 1 : return False
	
	for mid in keptIds:
		if not (mid in m_obj.cells_tmp): # discovered new marker
			newMarkers = True
			m_obj.cells_tmp[mid] = np.copy(local_corners[:,:3]) # corner pos relative to ref (which should be origin marker once mapping is done)
			m_obj.cells_i[mid] = Object(
				in_refs=[],        # markers positioned relative to us (all should be relative to marker 0 once mapping is done)
				out_ref=None,      # marker we are positionned relative to
				transitionMat=None # [transitionMat] * [local pos] = [ref pos]
			)
		
	# get orig for this shot
	orig_ind = np.argmin(keptIds)
	orig_id = keptIds[orig_ind]
	orig_ref = m_obj.cells_i[orig_id].out_ref
	for i in range(len(keptIds)):
		mid = keptIds[i]
		mref = m_obj.cells_i[mid].out_ref
		if mref is not None and mref < orig_id:
			orig_ind = i ; orig_id = mid ; orig_ref = mref
	
	# get transition mat.
	if orig_ref is not None:
		orig_invTransfo = np.matmul(m_obj.cells_i[orig_id].transitionMat, getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind]))
		orig_id = orig_ref
	else:
		orig_invTransfo = getInvTransformationMatrix(rvecs[orig_ind], tvecs[orig_ind])
	
	# update board ref
	if orig_id < m_obj.orig:
		m_obj.orig = orig_id 
		m_obj.cells = {}
		m_obj.cells[orig_id] = np.copy(local_corners[:,:3])
	
	for i in range(len(keptIds)):
		mid = keptIds[i]
		if mid == orig_id : continue
		
		marker_i = m_obj.cells_i[mid]
		if marker_i.out_ref == orig_id : continue
		
		update_marker(
			m_obj, mid, orig_id, 
			np.matmul(orig_invTransfo, getTransformationMatrix(rvecs[i], tvecs[i])),
			np.copy(local_corners), m_obj.orig == orig_id
		)
	
	return True

# get pos / rot of camera relative to board, the video frame should be distorsion free ! 
def getBoardTransform(cameradata, videoframe, board, transfo, corners, ids, dbview=False):	
	if len(board.cells) == 0 or len(ids) == 0 : return None
		
	objpoints = []
	imgpoints = []
	for i in range(len(ids)):
		mid = ids[i][0]
		if not (mid in board.cells) : continue
		for pnt in board.cells[mid] : objpoints.append(pnt)
		for corner in corners[i][0] : imgpoints.append(corner)
	if len(objpoints) == 0 : return None
	objpoints = np.array(objpoints, dtype=np.float32)
	imgpoints = np.array(imgpoints, dtype=np.float32)
	
	if transfo is not None : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(objpoints, imgpoints, cameradata['matrix'], cameradata['coeffs'], useExtrinsicGuess=True, flags=cv2.SOLVEPNP_ITERATIVE, rvec=transfo[4], tvec=transfo[5])
	else                   : _, rvec, tvec, reprErr = cv2.solvePnPGeneric(objpoints, imgpoints, cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_ITERATIVE)
	rvec = np.array(rvec[0], dtype=np.float32)
	tvec = np.array(tvec[0], dtype=np.float32)
	
	if dbview : cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, 0.1)
	
	rmat = cv2.Rodrigues(rvec)[0]
	newTransfo = getTransformationMatrix(rvec, tvec, rmat)
	invTransfo = getInvTransformationMatrix(rvec, tvec, rmat)
	
	# get cam pos (transform [0,0,0] from cam coords to board coords)
	cam_pos = np.matmul(invTransfo, np.array([0,0,0,1]))
	
	# get cam rotation around board z
	# transform the optical axis (vector [0,0,1]) from cam coords to board coords
	# we must transform both points of the camera z-axis vector
	cam_forward = np.matmul(invTransfo, np.array([0,0,1,1], np.float32)) - cam_pos
	# project unto (x,y) plane of board
	cam_forward[:2] /= np.linalg.norm(cam_forward[:2])
	
	return (cam_pos, cam_forward[:2], newTransfo, invTransfo, rvec, tvec)
	
def getMarkedObstacles(cameradata, videoframe, mrange, s, collider, transfo, corners, ids):
	obstacles = {}
	if len(ids) > 0:
		
		keptCorners = []
		keptInds = []
		for i in range(len(ids)):
			if ids[i][0] < mrange[0] or ids[i][0] > mrange[1] : continue
			keptCorners.append(corners[i])
			keptInds.append(i)
		if len(keptInds) == 0 : return Object(val=obstacles, collider=collider)
		
		local_corners = np.array([[0,0,0,1],[s,0,0,1],[s,s,0,1],[0,s,0,1]], dtype=np.float32) # CW top left order, x right, y bottom [x,y,z,1]*4
		rvecs = []
		tvecs = []
		for i in range(len(ids)):
			_, rvec, tvec = cv2.solvePnP(np.array(local_corners[:,:3]), corners[i][0], cameradata['matrix'], cameradata['coeffs'], flags=cv2.SOLVEPNP_IPPE)
			rvecs.append(rvec)
			tvecs.append(tvec)
		
		# group markers together if they are part of the same obstacle (same id)
		board_points = {}
		for ind in keptInds:
			mid = ids[ind][0]
			if not mid in board_points : board_points[mid] = []
			
			marker_transfo = np.matmul(transfo[3], getTransformationMatrix(rvecs[ind], tvecs[ind])) # marker -> camera -> board
			for i in range(4) : board_points[mid].append( np.matmul(marker_transfo, local_corners[i])[:2] ) # don't care about z
		
		# generate 2D colliders for obstacles
		if collider == 'Hull':
			for mid in board_points:
				obstacles[mid] = []
				hull_pnts = [board_points[mid][ind] for ind in ConvexHull(board_points[mid]).vertices]
				for pnt in hull_pnts: 
					obstacles[mid].append(pnt[0])
					obstacles[mid].append(pnt[1])
					
		elif collider == 'AABB':
			for mid in board_points:
				obstacles[mid] = []
				minX = 999999  ; minY = 999999
				maxX = -999999 ; maxY = -999999
				for pnt in board_points[mid]:
					maxX = max(maxX, pnt[0]) ; minX = min(minX, pnt[0])
					maxY = max(maxY, pnt[1]) ; minY = min(minY, pnt[1])
				obstacles[mid] = [minX,minY, maxX,minY, maxX,maxY, minX,maxY]
	
	return Object(val=obstacles, collider=collider)


# NOTE:
# - oldrvec / oldtvec shouldn't be used for auto_make_board and getMarkers but it seems to work fine...

# TODO:
# - allow different sized markers, provide size for each marker
# - enable cornerRefinement ?
