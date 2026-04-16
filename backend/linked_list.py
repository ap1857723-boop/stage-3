class Node:
    def __init__(self, seat_number):
        self.seat_number = seat_number
        self.prev = None
        self.next = None

class DoublyLinkedList:
    def __init__(self):
        self.head = None

    def insert_sorted(self, seat_number):
        """
        Inserts a seat node into the linked list in ascending order of seat_number.
        """
        new_node = Node(seat_number)
        
        # If list is empty
        if not self.head:
            self.head = new_node
            return
            
        # If new node should be the new head
        if seat_number < self.head.seat_number:
            new_node.next = self.head
            self.head.prev = new_node
            self.head = new_node
            return
            
        # Traverse to find the insertion point
        current = self.head
        while current.next and current.next.seat_number < seat_number:
            current = current.next
            
        # Insert after current
        new_node.next = current.next
        if current.next:
            current.next.prev = new_node
        current.next = new_node
        new_node.prev = current

    def remove(self, seat_number):
        """
        Removes a seat node from the linked list. Returns True if removed, False if not found.
        """
        current = self.head
        while current:
            if current.seat_number == seat_number:
                if current.prev:
                    current.prev.next = current.next
                else:
                    self.head = current.next # Node to remove was head
                    
                if current.next:
                    current.next.prev = current.prev
                return True
            current = current.next
        return False

    def get_all(self):
        """
        Returns a list of all seat numbers in the linked list.
        """
        seats = []
        current = self.head
        while current:
            seats.append(current.seat_number)
            current = current.next
        return seats
        
    def clear(self):
        self.head = None

class CinemaSeating:
    def __init__(self, rows=10, seats_per_row=7):
        self.rows = rows
        self.seats_per_row = seats_per_row
        # Array of head pointers (one linked list per row) to easily access independent rows.
        self.row_lists = [DoublyLinkedList() for _ in range(rows)]
        
    def init_available_seats(self, available_seats_by_row):
        # Clear existing lists to prevent duplicates on restarts
        for row_idx in range(self.rows):
            self.row_lists[row_idx].clear()
            
        for row_idx in range(self.rows):
            seats = available_seats_by_row.get(row_idx, [])
            for seat in seats:
                self.row_lists[row_idx].insert_sorted(seat)

    def get_available_seats(self):
        available = {}
        for row in range(self.rows):
            available[row] = self.row_lists[row].get_all()
        return available
        
    def book_seat(self, row, seat_number):
        return self.row_lists[row].remove(seat_number)
        
    def cancel_booking(self, row, seat_number):
        self.row_lists[row].insert_sorted(seat_number)
