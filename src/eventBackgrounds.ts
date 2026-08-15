const files: Readonly<Record<string,string>> = {
  "VB": "01-volleyball.webp",
  "FB": "02-football.webp",
  "BB": "03-basketball.webp",
  "TN": "04-tennis.webp",
  "GY": "05-gym.webp",
  "RN": "06-running.webp",
  "CY": "07-cycling.webp",
  "BD": "08-badminton.webp",
  "TT": "09-table-tennis.webp",
  "YG": "10-yoga.webp",
  "CF": "11-coffee.webp",
  "MV": "12-cinema.webp",
  "BW": "13-bowling.webp",
  "BG": "14-board-games.webp",
  "CH": "15-chess.webp",
  "KR": "16-karaoke.webp",
  "SK": "17-roller-skating.webp",
  "BR": "18-beer.webp",
  "QZ": "19-pub-quiz.webp",
  "WN": "20-wine-evening.webp",
  "CN": "21-concert.webp",
  "FS": "22-festival.webp",
  "DN": "23-dancing.webp",
  "HK": "24-hiking.webp",
  "WK": "25-park-walk.webp",
  "SW": "26-swimming.webp",
  "PC": "27-picnic.webp",
  "CP": "28-camping.webp",
  "FI": "29-fishing.webp",
  "KY": "30-kayaking.webp",
  "CT": "31-city-walk.webp",
  "DR": "32-dinner.webp",
  "LX": "33-language-exchange.webp",
  "CW": "34-coworking.webp",
  "MT": "35-new-connections.webp",
  "AR": "36-drawing.webp",
  "PH": "37-photo-walk.webp",
  "CR": "38-ceramics.webp",
  "JM": "39-music-jam.webp",
  "WS": "40-workshop.webp"
};

export const getEventBackground = (code:string) => {
  const file = files[code];
  return file ? `/activities/cards-3x4/${file.split("#")[0]}` : null;
};

export const getEventShareBackground = (code:string) => {
  const file = files[code];
  return file ? `/activities/share-6x5/${file.split("#")[0]}` : null;
};

export const getEventSheetBackground = (code:string) => {
  const file = files[code];
  return file ? `/activities/sheets-9x16/${file.split("#")[0]}` : null;
};
