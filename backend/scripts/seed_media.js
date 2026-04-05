const mongoose = require('mongoose');
const MediaItem = require('../src/db/models/MediaItem');
const config = require('../src/config');
const logger = require('../src/utils/logger');

async function seedMedia() {
  try {
    await mongoose.connect(config.MONGODB.URI);
    logger.info('Connected to MongoDB for seeding media...');

    // Clear existing media
    await MediaItem.deleteMany({});

    const initialMedia = [
      {
        title: 'Artemis II Crew Training',
        type: 'image',
        url: 'https://www.nasa.gov/wp-content/uploads/2023/11/artemis-ii-crew-training.jpg',
        category: 'crew',
        description: 'The Artemis II crew members participating in essential training exercises.'
      },
      {
        title: 'SLS Moon Rocket on Pad 39B',
        type: 'image',
        url: 'https://www.nasa.gov/wp-content/uploads/2023/04/artemis-ii-sls-pad.jpg',
        category: 'mission',
        description: 'The Space Launch System rocket for Artemis II being prepared for flight.'
      },
      {
        title: 'Artemis II: Bringing Humanity to the Moon',
        type: 'video',
        url: 'https://www.youtube.com/embed/S2X5S8S_SAY', // Note: Using embed for YouTube
        category: 'trailer',
        description: 'Official NASA trailer for the Artemis II mission.'
      },
      {
        title: 'Orion Spacecraft for Artemis II',
        type: 'image',
        url: 'https://www.nasa.gov/wp-content/uploads/2023/10/artemis-ii-orion-service-module.jpg',
        category: 'spacecraft',
        description: 'Close-up of the Orion crew module and service module being integrated.'
      }
    ];

    await MediaItem.insertMany(initialMedia);
    logger.info('Media seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error seeding media');
    process.exit(1);
  }
}

seedMedia();
