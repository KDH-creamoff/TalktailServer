const express = require("express");
const router = express.Router();
const { User, Hub, Device, Pet } = require("../models");
const fs = require("fs");
const path = require("path");

router.get("/loadOrg", async (req, res, next) => {
  try {
    const org = await User.findAll({
      raw: true,
      attributes: { exclude: ["password", "postcode"] },
      where: { email: "kms930322@naver.com" },
    });

    res.status(200).json(org);
  } catch (e) {
    console.error(e);
    next(e);
  }
});

router.get("/loadDatas", async(req, res, next) => {
  try {
    const org = await User.findOne({
      raw: true,
      attributes: { exclude: ["password", "postcode"] },
      where: { email: "kms930322@naver.com" },
    });
    const hub = await Hub.findOne({
      raw: true,
      where: {
        user_email: org.email,
      },
      attributes: ['address'],
    })
    const deviceLists = await Device.findAll({
      raw: true,
      where: {
        hub_address: hub.address,
      },
      attributes: ['address', "name"],
    })

    console.log("deviceLists : ", deviceLists);

    const deviceObjects = [];

    let filePaths = [];
    for(const list of deviceLists) {
      const deviceObject = {
        address: list.address,
        name: list.name,
        files: [],
      }
      const filePath = path.join(__dirname, "..", "data", list.address.replace(/:/g, '-'));
      filePaths.push(filePath);
      deviceObjects.push(deviceObject);
    }
    // console.log("filePaths : ", filePaths);
    for(const filePath of filePaths) {
      if(fs.existsSync(filePath)) {
        const files = fs.readdirSync(filePath);
        for(const file of files) {
          const fullFilePath = path.join(filePath, file);
          const fileStats = fs.statSync(fullFilePath);
          // 파일인지 확인 (폴더 제외)
          if(fileStats.isFile()) {
            const fileSizeBytes = fileStats.size; // 바이트 단위
            const fileSizeKB = (fileSizeBytes / 1024).toFixed(2); // KB 단위로 변환
            console.log("file : ", file, "size : ", fileSizeKB, "KB");
            const deviceObject = deviceObjects.find(obj => obj.address.replace(/:/g, '-') === file.split("_")[1].replace(/_/g, ':'));
            if(deviceObject) {
              deviceObject.files.push({
                name: file,
                size: parseFloat(fileSizeKB) // KB 단위
              });
            }
          }
        }
      }
    }

    console.log("deviceObjects : ", deviceObjects);
    

    res.status(200).json(deviceObjects);
  } catch(e) {
    console.error(e);
    next(e);
  }
})

router.post("/loadPets", async(req, res, next) => {
  try {
    const deviceAddress = req.body.address;
    console.log("deviceAddress : ", deviceAddress);

    const petInfos = await Pet.findAll({
      raw: true,
      where: {
        device_address: deviceAddress,
      }
    })

    res.status(200).json(petInfos);
  } catch(e) {
    console.error(e);
    next(e);
  }
})

router.post("/downloadFile", async (req, res, next) => {
  try {
    const { fileName, type } = req.body;
    console.log("fileName : ", fileName, "type : ", type);
    const device_code = fileName.split("_")[1];
    let filePath;
    const currentDay = fileName.split("_")[2].split("-")[0];
    if (type === "customer") {
      filePath = path.join(
        __dirname,
        "../data",
        device_code,
        currentDay,
        fileName
      ); // 파일 경로
    } else {
      filePath = path.join(
        __dirname,
        "../data",
        device_code,
        fileName
      ); // 파일 경로
    }

    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "파일을 찾을 수 없습니다." });
    }
    // 다운로드 헤더 설정
    const downloadFileName = path.basename(filePath);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${downloadFileName}"; filename*=UTF-8''${encodeURIComponent(
        downloadFileName
      )}`
    );

    // 파일 스트림으로 전송
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (e) {
    console.error(e);
    next(e);
  }
});

module.exports = router;
