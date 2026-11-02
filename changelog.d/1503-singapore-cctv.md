- Added Singapore (LTA via data.gov.sg) as a CCTV source pack, and the frame
  proxy now sniffs image magic bytes so feeds that mislabel real JPEGs as
  `application/octet-stream` still display instead of falling back to the
  placeholder (johanjude2007-cloud, #1503).
