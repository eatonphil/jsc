function sort(array) {
  var swapped;
  var tmp;

  do {
    swapped = false;
    for (var i = 0; i < array.length; i++) {
      if (array[i] && array[i + 1] && array[i] > array[i + 1]) {
	temp = array[i];
	array[i] = array[i + 1];
	array[i + 1] = temp;
        swapped = true;
      }
    }
  } while(swapped);

  return array;
}

function main() {
  console.log(bubble(new Array(3, 9, 100, 14, 32, 8, -9, 0, 192, 56, 33)));
}
