window.AppStrings = {
  meta: {
    title: 'mynotes'
  },
  login: {
    title: 'my notes #mynotes',
    passphrasePlaceholder: 'the-fun-zone',
    rememberRoom: 'Auto-join?',
    openBoard: 'Join Room',
    hintHtml: 'a little thang made by aria unicornfan <img src="assets/beandog.png" alt="beandog" width="32" height="18" style="vertical-align: text-bottom; margin-left: 4px; display: inline-block;" /><br><br>client-side encrypted collaborative sticky note board. post some notes for yourself or post with pals! nobody can snoop (not even me!) unless they know the exact room name! keep it secret like a password...<br><br>...or just roll your own server if you wanna! -> <a href="https://github.com/0x61726961/mynotes" target="_blank" rel="noopener noreferrer">source</a>'
  },
  board: {
    leaveBoardTitle: 'Leave Room',
    leaveBoardLabel: 'Leave Room',
    leaveBoardText: 'Exit',
    addButtonTitle: 'New Note',
    addButtonLabel: 'New Note',
    addButtonText: 'Add',
    addTextTitle: 'Text Note',
    addTextLabel: 'Text Note',
    addTextText: 'Text',
    addImageTitle: 'Picture Note',
    addImageLabel: 'Picture Note',
    addImageText: 'Image',
    addDoodleTitle: 'Doodle Note',
    addDoodleLabel: 'Doodle Note',
    addDoodleText: 'Doodle',
    roomUnknown: '[UNKNOWN AREA]'
  },
  modals: {
    text: {
      title: 'New Note',
      placeholder: 'Hello!',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save'
    },
    image: {
      title: 'Add Picture',
      dropZone: 'Drag \'n Drop<br>or<br>Click Here',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save'
    },
    doodle: {
      title: 'Draw Doodle',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save',
      eraser: 'Erase',
      clear: 'Clear',
      brushLabels: {
        pencil: 'Pencil',
        pen: 'Pen',
        marker: 'Marker'
      }
    },
    deleteConfirm: {
      title: 'Delete note forever and ever?',
      cancel: 'Nope!',
      confirm: 'Yup!'
    }
  },
  loading: {
    derivingKey: 'Deriving encryption key...',
    loadingNotes: 'Loading notes...',
    processingImage: 'Processing image...'
  },
  toasts: {
    openBoardFail: 'Failed to open room. Please try again.',
    createNoteFail: 'Failed to create note.',
    saveNoteFail: 'Failed to save note.',
    deleteNoteFail: 'Failed to delete note.',
    noteDeleted: 'Note deleted!',
    saveNotePositionFail: 'Failed to save note position.',
    saveNoteRotationFail: 'Failed to save note rotation.',
    enterText: 'Please enter some text!',
    processImageFail: 'Failed to process image.',
    saveImageFail: 'Failed to save image note.',
    saveDoodleFail: 'Failed to save doodle note.',
    noteLimitExceeded: 'Note limit exceeded.',
    databaseLimitReached: 'Storage limit reached. Please delete some notes.',
    payloadTooLarge: 'Note is too large.',
    drawSomething: 'Doodle a little first!'
  }
};
